require('dotenv').config();
const { app, BrowserWindow, ipcMain, screen, Notification } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const https = require('https');
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const history = [];

// --- Notify helper (toast + IPC to robot) ---
function notify(title, body, speak = true) {
  if (Notification.isSupported()) {
    new Notification({ title, body, silent: true }).show();
  }
  if (win) win.webContents.send('monitor-alert', { title, body, speak });
}

// --- OBS overlay status watcher ---
const STATUS_FILE = path.join('c:\\Web App Projects\\clauderobot\\obs-overlay', 'status.json');

function readStatus() {
  try { return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8')); }
  catch { return null; }
}

function watchStatus() {
  if (!fs.existsSync(STATUS_FILE)) return;
  fs.watch(STATUS_FILE, () => {
    const s = readStatus();
    if (s && win) win.webContents.send('claude-status', s);
  });
}

// --- Persistent memory ---
let memoryPath;
let memory = { facts: [] };

function loadMemory() {
  try {
    const raw = fs.readFileSync(memoryPath, 'utf8');
    memory = JSON.parse(raw);
    if (!Array.isArray(memory.facts)) memory.facts = [];
  } catch { memory = { facts: [] }; }
}

function saveMemory() {
  fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2), 'utf8');
}

function memorySystemPrompt() {
  if (!memory.facts.length) return '';
  return '\n\nThings you remember about the user:\n' + memory.facts.map(f => `- ${f}`).join('\n');
}

ipcMain.handle('get-memory', () => memory.facts);
ipcMain.handle('save-fact', (_, fact) => {
  const trimmed = fact.trim();
  if (trimmed && !memory.facts.includes(trimmed)) { memory.facts.push(trimmed); saveMemory(); }
  return memory.facts;
});
ipcMain.handle('delete-fact', (_, index) => { memory.facts.splice(index, 1); saveMemory(); return memory.facts; });
ipcMain.handle('clear-memory', () => { memory.facts = []; saveMemory(); return memory.facts; });

// --- Reminders ---
let remindersPath;
let reminders = [];

function loadReminders() {
  try { reminders = JSON.parse(fs.readFileSync(remindersPath, 'utf8')); }
  catch { reminders = []; }
}

function saveReminders() {
  fs.writeFileSync(remindersPath, JSON.stringify(reminders, null, 2), 'utf8');
}

ipcMain.handle('get-reminders', () => reminders);
ipcMain.handle('add-reminder', (_, { text, time }) => {
  reminders.push({ id: Date.now(), text, time, fired: false });
  saveReminders();
  return reminders;
});
ipcMain.handle('delete-reminder', (_, id) => {
  reminders = reminders.filter(r => r.id !== id);
  saveReminders();
  return reminders;
});

function checkReminders() {
  const now = Date.now();
  let changed = false;
  for (const r of reminders) {
    if (!r.fired && r.time <= now) {
      r.fired = true;
      changed = true;
      notify('Reminder', r.text, true);
    }
  }
  if (changed) saveReminders();
}

// --- Weather monitoring (Open-Meteo, Three Rivers MI) ---
const WEATHER_LAT = 41.9439;
const WEATHER_LON = -85.6333;
let lastWeatherCode = -1;

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
        if (code !== lastWeatherCode) {
          lastWeatherCode = code;
          const alert = WEATHER_ALERTS[code];
          if (alert) notify('Weather Alert', `${alert} — ${temp}°F`, true);
        }
      } catch {}
    });
  }).on('error', () => {});
}

// --- Chat ---
ipcMain.handle('chat-message', async (_, userMsg) => {
  history.push({ role: 'user', content: userMsg });
  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    system: 'You are a friendly desktop robot companion named Claude. You are small, fun, and helpful. Keep replies short — 1-3 sentences max. Be warm and a little playful.' + memorySystemPrompt(),
    messages: history,
  });
  const reply = res.content[0].text;
  history.push({ role: 'assistant', content: reply });
  if (history.length > 20) history.splice(0, 2);
  return reply;
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

let win;

function createWindow() {
  memoryPath    = path.join(app.getPath('userData'), 'memory.json');
  remindersPath = path.join(app.getPath('userData'), 'reminders.json');
  loadMemory();
  loadReminders();

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
  win.webContents.once('did-finish-load', () => {
    watchStatus();
    // Start monitors
    fetchWeather();
    setInterval(checkReminders, 30000);        // reminders every 30s
    setInterval(fetchWeather, 30 * 60 * 1000); // weather every 30min
    // Weather test — fires 3 seconds after load
    setTimeout(() => notify('Weather Alert', 'Thunderstorm outside! — 58°F', true), 3000);
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
