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
const memoryCount  = document.getElementById('memory-count');
const memoryCountS = document.getElementById('memory-count-s');

// Settings panel toggle
wrenchBtn.addEventListener('click', e => {
  e.stopPropagation();
  settingsPanel.classList.toggle('open');
  if (settingsPanel.classList.contains('open')) refreshMemoryList();
});
closeSettings.addEventListener('click', () => settingsPanel.classList.remove('open'));

rateSlider.addEventListener('input', () => rateVal.textContent = parseFloat(rateSlider.value).toFixed(1));
pitchSlider.addEventListener('input', () => pitchVal.textContent = parseFloat(pitchSlider.value).toFixed(1));

let bubbleTimer = null;
let chatAutoCloseTimer = null;
let muted = false;

muteBtn.addEventListener('click', e => {
  e.stopPropagation();
  muted = !muted;
  muteBtn.textContent = muted ? '🔇' : '🔊';
  muteBtn.classList.toggle('muted', muted);
  if (muted) window.speechSynthesis.cancel();
});

// --- Voice ---
function populateVoices() {
  const voices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
  if (!voices.length) return;
  voiceSelect.innerHTML = '';
  voices.forEach((v, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = v.name;
    voiceSelect.appendChild(opt);
  });
  const davidIdx = voices.findIndex(v => v.name.includes('David'));
  if (davidIdx >= 0) voiceSelect.value = davidIdx;
}

window.speechSynthesis.onvoiceschanged = populateVoices;
populateVoices();

function speak(text) {
  if (muted) return;
  window.speechSynthesis.cancel();
  const voices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate  = parseFloat(rateSlider.value);
  utter.pitch = parseFloat(pitchSlider.value);
  if (voices[voiceSelect.value]) utter.voice = voices[voiceSelect.value];
  window.speechSynthesis.speak(utter);
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

  showBubble('Thinking...', 'state-thinking');
  try {
    const reply = await window.electron.sendChat(text);
    addLog('bot', reply);
    showBubble(reply.length > 150 ? reply.slice(0, 147) + '...' : reply, '');
    speak(reply);
  } catch {
    addLog('bot', 'Something went wrong.');
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
});

// --- Claude activity status from OBS overlay ---
const STATUS_LABELS = {
  thinking: 'Thinking...',
  working:  null, // use message directly
  question: null,
  chat:     null,
  idle:     null,
};

window.electron.onClaudeStatus(({ type, message }) => {
  if (type === 'idle' || !type) return;
  const text = (type === 'thinking') ? 'Thinking...' : message;
  if (!text) return;
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
