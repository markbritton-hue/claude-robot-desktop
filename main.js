require('dotenv').config();
const { app, BrowserWindow, ipcMain, screen, Notification } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const https = require('https');
const Anthropic = require('@anthropic-ai/sdk');
const { google } = require('googleapis');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

// Firebase
const { initializeApp: initFirebase } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc, collection, getDocs, addDoc, deleteDoc, query, orderBy, limit } = require('firebase/firestore');

const firebaseApp = initFirebase({
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: 'clauderobot.firebaseapp.com',
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: 'clauderobot.firebasestorage.app',
  messagingSenderId: '719034857796',
  appId: '1:719034857796:web:ff0880355d421736ffbf11',
});
const db = getFirestore(firebaseApp);
const USER_DOC = 'users/mark';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const history = [];

// --- Notify helper ---
function notify(title, body, speak = true) {
  if (Notification.isSupported()) new Notification({ title, body, silent: true }).show();
  if (win) win.webContents.send('monitor-alert', { title, body, speak });
}

// --- Claude transcript watcher (replaces OBS overlay dependency) ---
const CLAUDE_PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const debounceTimers = {};

function projectNameFromPath(filePath) {
  const parts = filePath.split(path.sep);
  const idx = parts.lastIndexOf('projects');
  if (idx < 0) return null;
  const folder = parts[idx + 1] || '';
  const segments = folder.split('--');
  return segments[segments.length - 1] || null;
}

function getLatestAssistantBlock(filePath) {
  try {
    const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const obj = JSON.parse(lines[i]);
        if (!obj.message || obj.message.role !== 'assistant') continue;
        const blocks = obj.message.content;
        if (!Array.isArray(blocks)) continue;
        for (const block of blocks) {
          if (block.type === 'thinking') return { type: 'thinking' };
          if (block.type === 'tool_use') return { type: 'tool_use', name: block.name };
          if (block.type === 'text' && block.text && block.text.trim())
            return { type: 'text', text: block.text.trim() };
        }
      } catch {}
    }
  } catch {}
  return null;
}

function onTranscriptChange(filePath) {
  if (debounceTimers[filePath]) clearTimeout(debounceTimers[filePath]);
  debounceTimers[filePath] = setTimeout(() => {
    const block = getLatestAssistantBlock(filePath);
    if (!block || !win) return;
    const project = projectNameFromPath(filePath);

    if (block.type === 'thinking') {
      win.webContents.send('claude-status', { type: 'thinking', message: 'Thinking...', project });
    } else if (block.type === 'tool_use') {
      win.webContents.send('claude-status', { type: 'working', message: `Using ${block.name}...`, project });
    } else if (block.type === 'text') {
      if (/\?\s*$/.test(block.text)) {
        const trimmed = block.text.length > 350 ? block.text.slice(0, 347) + '...' : block.text;
        win.webContents.send('claude-status', { type: 'question', message: trimmed, project });
      } else {
        win.webContents.send('claude-status', { type: 'idle', message: '', project: null });
      }
    }
  }, 300);
}

function watchStatus() {
  if (!fs.existsSync(CLAUDE_PROJECTS)) return;
  fs.watch(CLAUDE_PROJECTS, { recursive: true }, (_, filename) => {
    if (!filename || !filename.endsWith('.jsonl')) return;
    const filePath = path.join(CLAUDE_PROJECTS, filename);
    onTranscriptChange(filePath);
  });
}

// --- Memory (Firestore) ---
let memory = { facts: [] };

async function loadMemory() {
  try {
    const snap = await getDoc(doc(db, USER_DOC));
    if (snap.exists()) {
      memory = snap.data();
      if (!Array.isArray(memory.facts)) memory.facts = [];
    }
  } catch { memory = { facts: [] }; }
}

async function saveMemory() {
  await setDoc(doc(db, USER_DOC), memory, { merge: true });
}

function memorySystemPrompt() {
  if (!memory.facts.length) return '';
  return '\n\nThings you remember about the user:\n' + memory.facts.map(f => `- ${f}`).join('\n');
}

ipcMain.handle('get-memory', () => memory.facts);
ipcMain.handle('get-history', () => history);

ipcMain.handle('save-fact', async (_, fact) => {
  const trimmed = fact.trim();
  if (trimmed && !memory.facts.includes(trimmed)) {
    memory.facts.push(trimmed);
    await saveMemory();
  }
  return memory.facts;
});

ipcMain.handle('delete-fact', async (_, index) => {
  memory.facts.splice(index, 1);
  await saveMemory();
  return memory.facts;
});

ipcMain.handle('clear-memory', async () => {
  memory.facts = [];
  await saveMemory();
  return memory.facts;
});

// --- Reminders (Firestore) ---
let reminders = [];

async function loadReminders() {
  try {
    const snap = await getDocs(query(collection(db, `${USER_DOC}/reminders`)));
    reminders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch { reminders = []; }
}

ipcMain.handle('get-reminders', () => reminders);

ipcMain.handle('add-reminder', async (_, { text, time }) => {
  const docRef = await addDoc(collection(db, `${USER_DOC}/reminders`), { text, time, fired: false });
  reminders.push({ id: docRef.id, text, time, fired: false });
  return reminders;
});

ipcMain.handle('delete-reminder', async (_, id) => {
  await deleteDoc(doc(db, `${USER_DOC}/reminders/${id}`));
  reminders = reminders.filter(r => r.id !== id);
  return reminders;
});

function checkReminders() {
  const now = Date.now();
  for (const r of reminders) {
    if (!r.fired && r.time <= now) {
      r.fired = true;
      deleteDoc(doc(db, `${USER_DOC}/reminders/${r.id}`)).catch(() => {});
      reminders = reminders.filter(x => x.id !== r.id);
      notify('Reminder', r.text, true);
    }
  }
}

// --- Weather monitoring ---
const WEATHER_LAT = 41.9439;
const WEATHER_LON = -85.6333;
let lastWeatherCode = -1;
let lastWeatherTemp = null;

const WMO_DESC = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Foggy', 48: 'Freezing fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Rain showers', 81: 'Rain showers', 82: 'Violent rain showers',
  85: 'Snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Severe thunderstorm',
};

ipcMain.handle('get-weather', () => {
  if (lastWeatherTemp === null) return null;
  return { temp: lastWeatherTemp, code: lastWeatherCode, desc: WMO_DESC[lastWeatherCode] || 'Unknown' };
});

const WEATHER_ALERTS = {
  51: 'Light drizzle starting', 53: 'Drizzle outside', 55: 'Heavy drizzle outside',
  61: 'Light rain starting', 63: 'Rain outside', 65: 'Heavy rain outside',
  71: 'Light snow starting', 73: 'Snow outside', 75: 'Heavy snow outside',
  80: 'Rain showers starting', 81: 'Rain showers outside', 82: 'Violent rain showers',
  95: 'Thunderstorm outside!', 96: 'Thunderstorm with hail!', 99: 'Severe thunderstorm!',
};

function fetchWeather() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${WEATHER_LAT}&longitude=${WEATHER_LON}&current=weather_code,temperature_2m&temperature_unit=fahrenheit`;
  https.get(url, res => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        const code = json.current.weather_code;
        const temp = Math.round(json.current.temperature_2m);
        lastWeatherTemp = temp;
        if (code !== lastWeatherCode) {
          lastWeatherCode = code;
          const alert = WEATHER_ALERTS[code];
          if (alert) notify('Weather Alert', `${alert} — ${temp}°F`, true);
        }
      } catch {}
    });
  }).on('error', () => {});
}

// --- Conversation history (Firestore) ---
async function loadHistory() {
  try {
    const snap = await getDocs(query(
      collection(db, `${USER_DOC}/conversations`),
      orderBy('ts'), limit(20)
    ));
    snap.docs.forEach(d => history.push(d.data().msg));
  } catch {}
}

async function saveMessage(msg) {
  try {
    await addDoc(collection(db, `${USER_DOC}/conversations`), { msg, ts: Date.now() });
    // Keep only last 40 messages in Firestore
    const snap = await getDocs(query(collection(db, `${USER_DOC}/conversations`), orderBy('ts')));
    if (snap.docs.length > 40) {
      const toDelete = snap.docs.slice(0, snap.docs.length - 40);
      for (const d of toDelete) await deleteDoc(d.ref);
    }
  } catch {}
}

// --- Token tracking ---
let tokenBudget = 50000;
let tokenUsage = { date: '', used: 0 };

async function loadTokenUsage() {
  try {
    const snap = await getDoc(doc(db, USER_DOC));
    if (snap.exists()) {
      if (snap.data().tokenUsage) tokenUsage = snap.data().tokenUsage;
      if (snap.data().tokenBudget) tokenBudget = snap.data().tokenBudget;
    }
  } catch {}
  const today = new Date().toDateString();
  if (tokenUsage.date !== today) tokenUsage = { date: today, used: 0 };
}

async function addTokens(n) {
  const today = new Date().toDateString();
  if (tokenUsage.date !== today) tokenUsage = { date: today, used: 0 };
  tokenUsage.used += n;
  try { await setDoc(doc(db, USER_DOC), { tokenUsage }, { merge: true }); } catch {}
  if (win) win.webContents.send('token-update', { used: tokenUsage.used, budget: tokenBudget });
}

ipcMain.handle('get-tokens', () => ({ used: tokenUsage.used, budget: tokenBudget }));

ipcMain.handle('set-token-budget', async (_, budget) => {
  tokenBudget = budget;
  try { await setDoc(doc(db, USER_DOC), { tokenBudget }, { merge: true }); } catch {}
  if (win) win.webContents.send('token-update', { used: tokenUsage.used, budget: tokenBudget });
});

// --- Chat ---
ipcMain.handle('chat-message', async (_, userMsg) => {
  history.push({ role: 'user', content: userMsg });
  await saveMessage({ role: 'user', content: userMsg });

  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    system: 'You are a friendly desktop robot companion named Claude. You are small, fun, and helpful. Keep replies short — 1-3 sentences max. Be warm and a little playful.' + memorySystemPrompt(),
    messages: history,
  });
  const reply = res.content[0].text;
  const tokensUsed = (res.usage?.input_tokens || 0) + (res.usage?.output_tokens || 0);
  const contextPct = Math.min(100, Math.round(((res.usage?.input_tokens || 0) / 200000) * 100));
  await addTokens(tokensUsed);
  if (win) win.webContents.send('context-update', contextPct);
  history.push({ role: 'assistant', content: reply });
  await saveMessage({ role: 'assistant', content: reply });
  if (history.length > 40) history.splice(0, 2);
  return reply;
});

// --- Edge TTS ---
const EDGE_VOICES = [
  { id: 'en-US-JennyNeural',   name: 'Jenny (US Female)' },
  { id: 'en-US-GuyNeural',     name: 'Guy (US Male)' },
  { id: 'en-US-AriaNeural',    name: 'Aria (US Female)' },
  { id: 'en-GB-SoniaNeural',   name: 'Sonia (UK Female)' },
  { id: 'en-GB-RyanNeural',    name: 'Ryan (UK Male)' },
  { id: 'en-AU-NatashaNeural', name: 'Natasha (AU Female)' },
];

ipcMain.handle('get-edge-voices', () => EDGE_VOICES);

ipcMain.handle('speak-edge', async (_, { text, voiceId, rate, pitch }) => {
  try {
    const tts = new MsEdgeTTS();
    const voice = voiceId || 'en-US-JennyNeural';
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = await tts.toStream(text);
    const chunks = [];
    await new Promise((resolve, reject) => {
      audioStream.on('data', d => chunks.push(d));
      audioStream.on('end', resolve);
      audioStream.on('error', reject);
    });
    return Buffer.concat(chunks).toString('base64');
  } catch (e) {
    console.error('[edge-tts]', e.message);
    return null;
  }
});

// --- Speech recognition ---
ipcMain.handle('start-listening', () => {
  return new Promise((resolve, reject) => {
    const script = [
      'Add-Type -AssemblyName System.Speech',
      '$rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine',
      '$rec.SetInputToDefaultAudioDevice()',
      '$grammar = New-Object System.Speech.Recognition.DictationGrammar',
      '$rec.LoadGrammar($grammar)',
      '$rec.BabbleTimeout = [TimeSpan]::FromSeconds(3)',
      '$rec.InitialSilenceTimeout = [TimeSpan]::FromSeconds(5)',
      '$result = $rec.Recognize([TimeSpan]::FromSeconds(8))',
      'if ($result) { Write-Output $result.Text } else { Write-Output "" }',
      '$rec.Dispose()',
    ].join('\r\n');
    const tmpFile = path.join(os.tmpdir(), 'claude-listen.ps1');
    fs.writeFileSync(tmpFile, script, 'utf8');
    exec(`powershell -ExecutionPolicy Bypass -File "${tmpFile}"`, { timeout: 15000 }, (err, stdout, stderr) => {
      fs.unlinkSync(tmpFile);
      if (err) { reject(new Error(stderr || err.message)); return; }
      resolve(stdout.trim());
    });
  });
});

// --- Google Calendar ---
const GCREDS_PATH = path.join(__dirname, 'google-credentials.json');
const GTOKEN_PATH = path.join(__dirname, 'google-token.json');
let calendarAuth = null;

async function getCalendarAuth() {
  if (!fs.existsSync(GCREDS_PATH)) return null;
  const { client_id, client_secret, redirect_uris } = JSON.parse(fs.readFileSync(GCREDS_PATH)).installed;
  const oAuth2 = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (fs.existsSync(GTOKEN_PATH)) {
    oAuth2.setCredentials(JSON.parse(fs.readFileSync(GTOKEN_PATH)));
    return oAuth2;
  }

  // First run — open browser for auth
  const authUrl = oAuth2.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar'],
  });

  const { shell } = require('electron');
  shell.openExternal(authUrl);

  // Listen on localhost for the redirect code
  return new Promise((resolve) => {
    const http = require('http');
    const server = http.createServer(async (req, res) => {
      const code = new URL(req.url, 'http://localhost').searchParams.get('code');
      if (!code) { res.end('No code'); return; }
      res.end('<h2>Authorized! You can close this tab.</h2>');
      server.close();
      const { tokens } = await oAuth2.getToken(code);
      oAuth2.setCredentials(tokens);
      fs.writeFileSync(GTOKEN_PATH, JSON.stringify(tokens));
      calendarAuth = oAuth2;
      resolve(oAuth2);
    });
    server.listen(80, () => console.log('Waiting for Google auth on port 80...'));
  });
}

async function checkCalendar() {
  if (!calendarAuth) return;
  try {
    const cal = google.calendar({ version: 'v3', auth: calendarAuth });
    const now = new Date();
    const soon = new Date(now.getTime() + 15 * 60 * 1000); // next 15 min
    const res = await cal.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: soon.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });
    const events = res.data.items || [];
    for (const ev of events) {
      const start = ev.start.dateTime || ev.start.date;
      const startTime = new Date(start);
      const minsAway = Math.round((startTime - now) / 60000);
      const label = minsAway <= 1 ? 'starting now' : `in ${minsAway} minutes`;
      notify('Calendar', `${ev.summary} ${label}`, true);
    }
  } catch (e) {
    console.error('[calendar]', e.message);
  }
}

let win;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width: 300, height: 500,
    x: width - 320, y: height - 520,
    transparent: true, frame: false, alwaysOnTop: true,
    skipTaskbar: true, resizable: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });

  win.loadFile('renderer/index.html');
  win.setIgnoreMouseEvents(false);
  // win.webContents.openDevTools({ mode: 'detach' });

  win.webContents.once('did-finish-load', async () => {
    await loadMemory();
    await loadReminders();
    await loadHistory();
    await loadTokenUsage();
    // Push history and reminders to renderer now that they're loaded
    win.webContents.send('init-data', { history, reminders });
    watchStatus();
    fetchWeather();
    setInterval(checkReminders, 30000);
    setInterval(fetchWeather, 30 * 60 * 1000);
    getCalendarAuth().then(auth => {
      if (auth) {
        calendarAuth = auth;
        checkCalendar();
        setInterval(checkCalendar, 5 * 60 * 1000); // check every 5 min
      }
    });
  });

  win.webContents.session.setPermissionRequestHandler((wc, permission, callback) => {
    callback(permission === 'media');
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

ipcMain.on('set-ignore-mouse', (_, ignore) => {
  win.setIgnoreMouseEvents(ignore, { forward: true });
});

ipcMain.on('quit-app', () => app.quit());
ipcMain.on('move-window', (_, { x, y }) => win && win.setPosition(Math.round(x), Math.round(y)));
