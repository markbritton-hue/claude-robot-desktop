const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),
  onChatReply: (cb) => ipcRenderer.on('chat-reply', (_, msg) => cb(msg)),
  sendChat: (msg) => ipcRenderer.invoke('chat-message', msg),
  startListening: () => ipcRenderer.invoke('start-listening'),
  getVoices: () => ipcRenderer.invoke('get-voices'),
  speak: (text, voiceId) => ipcRenderer.invoke('speak', { text, voiceId }),
  onClaudeStatus: (cb) => ipcRenderer.on('claude-status', (_, s) => cb(s)),
  getMemory: () => ipcRenderer.invoke('get-memory'),
  saveFact: (fact) => ipcRenderer.invoke('save-fact', fact),
  deleteFact: (index) => ipcRenderer.invoke('delete-fact', index),
  clearMemory: () => ipcRenderer.invoke('clear-memory'),
});
