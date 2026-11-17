require('dotenv').config();
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const history = [];

// OBS overlay status.json — watch for Claude activity updates
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
let memory = { facts: [] }; // array of strings

function loadMemory() {
  try {
    const raw = fs.readFileSync(memoryPath, 'utf8');
    memory = JSON.parse(raw);
    if (!Array.isArray(memory.facts)) memory.facts = [];
  } catch {
    memory = { facts: [] };
  }
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
  if (trimmed && !memory.facts.includes(trimmed)) {
    memory.facts.push(trimmed);
    saveMemory();
  }
  return memory.facts;
});

ipcMain.handle('delete-fact', (_, index) => {
  memory.facts.splice(index, 1);
  saveMemory();
  return memory.facts;
});

ipcMain.handle('clear-memory', () => {
  memory.facts = [];
  saveMemory();
  return memory.facts;
});

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

// --- Speech ---
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
  memoryPath = path.join(app.getPath('userData'), 'memory.json');
  loadMemory();

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  win = new BrowserWindow({
    width: 300,
    height: 500,
    x: width - 320,
    y: height - 520,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    }
  });

  win.loadFile('renderer/index.html');
  win.setIgnoreMouseEvents(false);
  win.webContents.once('did-finish-load', watchStatus);

  win.webContents.session.setPermissionRequestHandler((wc, permission, callback) => {
    callback(permission === 'media');
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

ipcMain.on('set-ignore-mouse', (_, ignore) => {
  win.setIgnoreMouseEvents(ignore, { forward: true });
});
