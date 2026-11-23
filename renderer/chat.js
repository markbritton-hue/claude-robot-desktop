// Robot mood bridge — robot.js fires a custom event we listen to, and we dispatch moods back
function setMood(m) { document.dispatchEvent(new CustomEvent('set-mood', { detail: m })); }
function setClaudeState(s) { document.dispatchEvent(new CustomEvent('set-claude-state', { detail: s })); }

const panel        = document.getElementById('chat-panel');
const log          = document.getElementById('chat-log');
const input        = document.getElementById('chat-input');
const sendBtn      = document.getElementById('chat-send');
const closeBtn     = document.getElementById('close-chat');
const bubble       = document.getElementById('bubble');
const canvas       = document.getElementById('robot-click-area');
const micBtn       = document.getElementById('mic-btn');
const wrenchBtn    = document.getElementById('wrench-btn');
const muteBtn      = document.getElementById('mute-btn');
const settingsPanel= document.getElementById('settings-panel');
const closeSettings= document.getElementById('close-settings');
const voiceSelect  = document.getElementById('voice-select');
const rateSlider   = document.getElementById('rate-slider');
const pitchSlider  = document.getElementById('pitch-slider');
const rateVal      = document.getElementById('rate-val');
const pitchVal     = document.getElementById('pitch-val');
const memoryList   = document.getElementById('memory-list');
const clearMemBtn  = document.getElementById('clear-memory-btn');
const quitBtn      = document.getElementById('quit-btn');
const memoryCount  = document.getElementById('memory-count');
const memoryCountS = document.getElementById('memory-count-s');

const reminderList  = document.getElementById('reminder-list');
const reminderCount = document.getElementById('reminder-count');
const tokenBar      = document.getElementById('token-bar');
const tokenPct      = document.getElementById('token-pct');
const budgetSlider  = document.getElementById('budget-slider');
const budgetVal     = document.getElementById('budget-val');
const tokensUsedEl  = document.getElementById('tokens-used');

function updateTokenBag({ used, budget }) {
  const pct = Math.max(0, Math.min(100, Math.round((1 - used / budget) * 100)));
  tokenBar.style.width = pct + '%';
  tokenPct.textContent = pct + '%';
  tokenBar.style.background = pct > 50 ? '#4ade80' : pct > 20 ? '#facc15' : '#f87171';
  budgetSlider.value = budget;
  budgetVal.textContent = budget.toLocaleString();
  tokensUsedEl.textContent = used.toLocaleString();
}

window.electron.getTokens().then(updateTokenBag);
window.electron.onTokenUpdate(updateTokenBag);

budgetSlider.addEventListener('input', () => {
  budgetVal.textContent = parseInt(budgetSlider.value).toLocaleString();
});
budgetSlider.addEventListener('change', () => {
  window.electron.setTokenBudget(parseInt(budgetSlider.value));
});

function refreshReminderList(reminders) {
  reminderCount.textContent = reminders.length;
  reminderList.innerHTML = '';
  if (!reminders.length) {
    reminderList.innerHTML = '<div class="memory-empty">No reminders set.</div>';
    return;
  }
  reminders.forEach(r => {
    const row = document.createElement('div');
    row.className = 'reminder-item';
    const txt = document.createElement('span');
    txt.className = 'reminder-text';
    txt.textContent = r.text;
    const time = document.createElement('span');
    time.className = 'reminder-time';
    time.textContent = new Date(r.time).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
    const del = document.createElement('button');
    del.className = 'reminder-del';
    del.textContent = '✕';
    del.addEventListener('click', async () => {
      await window.electron.deleteReminder(r.id);
      const updated = await window.electron.getReminders();
      refreshReminderList(updated);
    });
    row.appendChild(txt);
    row.appendChild(time);
    row.appendChild(del);
    reminderList.appendChild(row);
  });
}

// Receive history + reminders pushed from main after Firestore load
window.electron.onInitData(({ history, reminders }) => {
  if (history && history.length) {
    const recent = history.slice(-10);
    recent.forEach(msg => addLog(msg.role === 'user' ? 'you' : 'bot', msg.content));
    const divider = document.createElement('div');
    divider.className = 'history-divider';
    divider.textContent = '— previous session —';
    log.insertBefore(divider, log.firstChild);
  }
  if (reminders) refreshReminderList(reminders);
});

// Settings panel toggle
wrenchBtn.addEventListener('click', async e => {
  e.stopPropagation();
  settingsPanel.classList.toggle('open');
  if (settingsPanel.classList.contains('open')) {
    refreshMemoryList();
    const reminders = await window.electron.getReminders();
    refreshReminderList(reminders);
  }
});
closeSettings.addEventListener('click', () => settingsPanel.classList.remove('open'));

rateSlider.addEventListener('input', () => { rateVal.textContent = parseFloat(rateSlider.value).toFixed(1); saveSettings(); });
pitchSlider.addEventListener('input', () => { pitchVal.textContent = parseFloat(pitchSlider.value).toFixed(1); saveSettings(); });

let bubbleTimer = null;
let chatAutoCloseTimer = null;
let muted = false;

muteBtn.addEventListener('click', e => {
  e.stopPropagation();
  muted = !muted;
  muteBtn.textContent = muted ? '🔇' : '🔊';
  muteBtn.classList.toggle('muted', muted);
  if (muted && currentAudio) { currentAudio.pause(); currentAudio = null; }
});

// --- Voice (Microsoft Edge Neural TTS) ---
let edgeVoices = [];
let currentAudio = null;

function saveSettings() {
  localStorage.setItem('voiceIdx', voiceSelect.value);
  localStorage.setItem('rate', rateSlider.value);
  localStorage.setItem('pitch', pitchSlider.value);
}

function loadSettings() {
  const rate  = localStorage.getItem('rate');
  const pitch = localStorage.getItem('pitch');
  if (rate)  { rateSlider.value  = rate;  rateVal.textContent  = parseFloat(rate).toFixed(1); }
  if (pitch) { pitchSlider.value = pitch; pitchVal.textContent = parseFloat(pitch).toFixed(1); }
}

async function populateVoices() {
  edgeVoices = await window.electron.getEdgeVoices();
  voiceSelect.innerHTML = '';
  edgeVoices.forEach((v, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = v.name;
    voiceSelect.appendChild(opt);
  });
  const savedIdx = localStorage.getItem('voiceIdx');
  if (savedIdx !== null) voiceSelect.value = savedIdx;
}

loadSettings();
populateVoices();

voiceSelect.addEventListener('change', saveSettings);
rateSlider.addEventListener('change', saveSettings);
pitchSlider.addEventListener('change', saveSettings);

async function speak(text) {
  if (muted) return;
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  const voice = edgeVoices[voiceSelect.value]?.id || 'en-US-JennyNeural';
  const rate  = parseFloat(rateSlider.value);
  const pitch = parseFloat(pitchSlider.value);
  const b64 = await window.electron.speakEdge(text, voice, rate, pitch);
  if (!b64) return;
  currentAudio = new Audio('data:audio/mp3;base64,' + b64);
  currentAudio.play();
}

// --- Memory ---
async function refreshMemoryList() {
  const facts = await window.electron.getMemory();
  memoryCount.textContent = facts.length;
  memoryCountS.textContent = facts.length === 1 ? '' : 's';
  memoryList.innerHTML = '';
  if (!facts.length) {
    memoryList.innerHTML = '<div class="memory-empty">Nothing remembered yet.<br>Say "remember…" to save something.</div>';
    return;
  }
  facts.forEach((fact, i) => {
    const row = document.createElement('div');
    row.className = 'memory-item';
    const txt = document.createElement('span');
    txt.textContent = fact;
    const del = document.createElement('button');
    del.textContent = '✕';
    del.className = 'memory-del';
    del.addEventListener('click', async () => {
      await window.electron.deleteFact(i);
      refreshMemoryList();
    });
    row.appendChild(txt);
    row.appendChild(del);
    memoryList.appendChild(row);
  });
}

quitBtn.addEventListener('click', () => window.electron.quit());

clearMemBtn.addEventListener('click', async () => {
  await window.electron.clearMemory();
  refreshMemoryList();
});

// Detect "remember X" commands
function extractRememberFact(text) {
  const m = text.match(/^(?:please\s+)?remember\s+(?:that\s+)?(.+)/i);
  return m ? m[1].trim() : null;
}

// Parse "remind me at 3pm to call Bob" or "remind me in 10 minutes to..."
function parseReminder(text) {
  // "remind me in X minutes/hours to ..."
  let m = text.match(/^remind\s+me\s+in\s+(\d+)\s+(minute|minutes|hour|hours)\s+to\s+(.+)/i);
  if (m) {
    const amount = parseInt(m[1]);
    const unit = m[2].toLowerCase().startsWith('h') ? 3600000 : 60000;
    return { reminderText: m[3].trim(), time: Date.now() + amount * unit };
  }
  // "remind me at 3pm / 3:30pm / 15:00 to ..."
  m = text.match(/^remind\s+me\s+at\s+([\d:]+\s*(?:am|pm)?)\s+to\s+(.+)/i);
  if (m) {
    const timeStr = m[1].trim();
    const reminderText = m[2].trim();
    const now = new Date();
    let target = new Date(now.toDateString() + ' ' + timeStr);
    if (isNaN(target)) return null;
    if (target <= now) target.setDate(target.getDate() + 1); // push to tomorrow if past
    return { reminderText, time: target.getTime() };
  }
  return null;
}

// --- Bubble ---
function showBubble(text, stateClass = '') {
  if (bubbleTimer) clearTimeout(bubbleTimer);
  bubble.className = stateClass ? `show ${stateClass}` : 'show';
  bubble.textContent = text;
  bubbleTimer = setTimeout(() => bubble.classList.remove('show'), 10000);
}

// --- Chat log ---
function addLog(who, text) {
  const div = document.createElement('div');
  div.className = who;
  div.textContent = (who === 'you' ? 'You: ' : 'Claude: ') + text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

// --- Send message ---
async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  addLog('you', text);

  // Check for "remember X" command
  const fact = extractRememberFact(text);
  if (fact) {
    await window.electron.saveFact(fact);
    const ack = `Got it! I'll remember that ${fact}.`;
    addLog('bot', ack);
    showBubble(ack, 'state-chat');
    speak(ack);
    refreshMemoryList();
    return;
  }

  // Check for weather question
  if (/weather|temperature|temp|how (hot|cold|warm)|what('?s| is) it like outside/i.test(text)) {
    const w = await window.electron.getWeather();
    const reply = w
      ? `It's ${w.temp}°F and ${w.desc.toLowerCase()} in Three Rivers right now.`
      : "I haven't fetched the weather yet — give me a moment and try again!";
    addLog('bot', reply);
    showBubble(reply, 'state-chat');
    speak(reply);
    setMood('happy');
    setTimeout(() => setMood('idle'), 8000);
    return;
  }

  // Check for "remind me" command
  const reminder = parseReminder(text);
  if (reminder) {
    await window.electron.addReminder(reminder.reminderText, reminder.time);
    const when = new Date(reminder.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const ack = `Got it! I'll remind you to ${reminder.reminderText} at ${when}.`;
    addLog('bot', ack);
    showBubble(ack, 'state-chat');
    speak(ack);
    return;
  }

  setMood('thinking');
  showBubble('Thinking...', 'state-thinking');
  try {
    const reply = await window.electron.sendChat(text);
    addLog('bot', reply);
    showBubble(reply.length > 150 ? reply.slice(0, 147) + '...' : reply, '');
    setMood('happy');
    speak(reply);
    setTimeout(() => setMood('idle'), 8000);
  } catch {
    addLog('bot', 'Something went wrong.');
    setMood('concerned');
    setTimeout(() => setMood('idle'), 5000);
  }
}

sendBtn.addEventListener('click', sendMessage);
input.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });

function resetChatAutoClose() {
  if (chatAutoCloseTimer) clearTimeout(chatAutoCloseTimer);
  chatAutoCloseTimer = setTimeout(() => panel.classList.remove('open'), 20000);
}

canvas.addEventListener('click', () => {
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) {
    setTimeout(() => input.focus(), 50);
    resetChatAutoClose();
  } else {
    if (chatAutoCloseTimer) clearTimeout(chatAutoCloseTimer);
  }
});

// Reset timer on any interaction inside the panel
input.addEventListener('keydown', resetChatAutoClose);
input.addEventListener('focus', resetChatAutoClose);
closeBtn.addEventListener('click', () => {
  if (chatAutoCloseTimer) clearTimeout(chatAutoCloseTimer);
  panel.classList.remove('open');
});

// --- Monitor alerts (email, weather, reminders) ---
window.electron.onMonitorAlert(({ title, body, speak: shouldSpeak }) => {
  showBubble(`${title}: ${body}`, 'state-chat');
  if (shouldSpeak) speak(`${title}. ${body}`);
  const m = title === 'Reminder' ? 'concerned' : title === 'Weather Alert' ? 'concerned' : 'excited';
  setMood(m);
  setTimeout(() => setMood('idle'), 10000);
});

// --- Claude activity status from OBS overlay ---
const STATUS_LABELS = {
  thinking: 'Thinking...',
  working:  null, // use message directly
  question: null,
  chat:     null,
  idle:     null,
};

window.electron.onClaudeStatus(({ type, message, project }) => {
  setClaudeState(type);
  if (type === 'idle' || !type) return;
  const baseText = (type === 'thinking') ? 'Thinking...' : message;
  if (!baseText) return;
  const text = project ? `[${project}] ${baseText}` : baseText;
  const cls = type === 'thinking' ? 'state-thinking' : type === 'question' ? 'state-chat' : '';
  showBubble(text, cls);
});

// --- Hourly time announcement ---
let lastAnnouncedHour = -1;

function checkHourlyAnnouncement() {
  const now = new Date();
  const h = now.getHours();
  if (now.getMinutes() === 0 && h !== lastAnnouncedHour) {
    lastAnnouncedHour = h;
    const h12 = h % 12 || 12;
    const ampm = h < 12 ? 'AM' : 'PM';
    const msg = `It's ${h12} o'clock ${ampm}!`;
    showBubble(msg, 'state-chat');
    speak(msg);
  }
}

setInterval(checkHourlyAnnouncement, 30000); // check every 30 seconds

// --- Proactive check-ins ---
let workSessionStart = null;      // when coding session began
let lastBreakNudge = 0;           // timestamp of last break reminder
let lastCheckIn = Date.now();     // timestamp of last general check-in

const BREAK_NUDGES = [
  "Hey, you've been at it for a while — take a quick stretch!",
  "Don't forget to blink! You've been coding for over an hour.",
  "Quick break? Your eyes will thank you.",
  "You've been working hard — maybe grab some water?",
];

const CHECK_IN_MSGS = [
  "How's it going? Need anything?",
  "Still hanging in there? Let me know if you need help!",
  "Just checking in — everything okay?",
  "Hey! How's the work going today?",
  "Taking a breather? I'm here if you need me.",
];

// Track Claude Code working state for session timing
let _lastClaudeType = null;

const _origClaudeStatus = window.electron.onClaudeStatus;

window.electron.onClaudeStatus(({ type, message }) => {
  if (type !== _lastClaudeType) {
    if (type === 'working' || type === 'thinking') {
      if (!workSessionStart) workSessionStart = Date.now();
    } else if (type === 'idle' || !type) {
      workSessionStart = null;
    }
    _lastClaudeType = type;
  }
});

function checkProactive() {
  const now = Date.now();

  // Break nudge: coding > 60 min without a break reminder
  if (workSessionStart && (now - workSessionStart) > 60 * 60 * 1000) {
    if (now - lastBreakNudge > 60 * 60 * 1000) {
      lastBreakNudge = now;
      const msg = BREAK_NUDGES[Math.floor(Math.random() * BREAK_NUDGES.length)];
      showBubble(msg, 'state-chat');
      speak(msg);
      setMood('concerned');
      setTimeout(() => setMood('idle'), 10000);
      return;
    }
  }

  // General check-in every 45–75 minutes of idle time
  const checkInInterval = (45 + Math.floor(Math.random() * 30)) * 60 * 1000;
  if (!workSessionStart && (now - lastCheckIn) > checkInInterval) {
    lastCheckIn = now;
    const h = new Date().getHours();
    if (h >= 8 && h < 22) { // only during waking hours
      const msg = CHECK_IN_MSGS[Math.floor(Math.random() * CHECK_IN_MSGS.length)];
      showBubble(msg, 'state-chat');
      speak(msg);
      setMood('happy');
      setTimeout(() => setMood('idle'), 10000);
    }
  }
}

setInterval(checkProactive, 60000); // check every minute

// Startup greeting after 3 seconds
setTimeout(() => {
  const h = new Date().getHours();
  const greeting = h < 12 ? 'Good morning!' : h < 17 ? 'Good afternoon!' : 'Good evening!';
  showBubble(`${greeting} I'm here if you need me.`, 'state-chat');
  speak(`${greeting} I'm here if you need me.`);
}, 3000);

// --- Mic ---
let listening = false;

micBtn.addEventListener('click', async () => {
  if (listening) return;
  listening = true;
  micBtn.classList.add('listening');
  micBtn.textContent = '⏹';
  showBubble('Listening...', 'state-thinking');

  try {
    const transcript = await window.electron.startListening();
    micBtn.classList.remove('listening');
    micBtn.textContent = '🎤';
    listening = false;
    if (transcript) {
      input.value = transcript;
      sendMessage();
    } else {
      showBubble("I didn't catch that — try again!", '');
    }
  } catch {
    micBtn.classList.remove('listening');
    micBtn.textContent = '🎤';
    listening = false;
    showBubble('Mic error — check your microphone.', '');
  }
});
