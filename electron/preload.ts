import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  moveWindow: (delta: { dx: number; dy: number }) => ipcRenderer.invoke('move-window', delta),
  openSettings: () => ipcRenderer.invoke('open-settings'),
  closeSettings: () => ipcRenderer.invoke('close-settings'),
  resizeForSettings: () => ipcRenderer.invoke('resize-for-settings'),
  resizeForBubble: () => ipcRenderer.invoke('resize-for-bubble'),
  resizeForOnboarding: () => ipcRenderer.invoke('resize-for-onboarding'),
  resizeForInput: () => ipcRenderer.invoke('resize-for-input'),
  updateHotkey: (hotkey: string) => ipcRenderer.invoke('update-hotkey', hotkey),
  updateVoiceHotkey: (hotkey: string) => ipcRenderer.invoke('update-voice-hotkey', hotkey),
  onToggleVoiceInput: (callback: () => void) => {
    ipcRenderer.on('toggle-voice-input', callback)
    return () => { ipcRenderer.removeListener('toggle-voice-input', callback) }
  },
  quitApp: () => ipcRenderer.invoke('quit-app'),
  testConnection: (params: { provider: string; model: string; apiKey: string; baseUrl: string }) =>
    ipcRenderer.invoke('test-connection', params),
  listOllamaModels: (baseUrl: string) =>
    ipcRenderer.invoke('list-ollama-models', baseUrl),
  chatCompletion: (params: {
    provider: string
    apiKey: string
    model: string
    baseUrl: string
    messages: { role: string; content: string }[]
  }) => ipcRenderer.invoke('chat-completion', params),
  abortChat: () => ipcRenderer.invoke('abort-chat'),
  saveNote: (text: string) => ipcRenderer.invoke('save-note', text),
  encryptApiKey: (plain: string) => ipcRenderer.invoke('encrypt-api-key', plain),
  decryptApiKey: (encoded: string) => ipcRenderer.invoke('decrypt-api-key', encoded),
  captureDesktopForGlass: () => ipcRenderer.invoke('capture-desktop-for-glass'),
  webSearch: (params: { query: string; provider: string; apiKey: string; instanceUrl?: string; maxResults?: number; timeout?: number }) =>
    ipcRenderer.invoke('search:web', params),
  whisperTranscribe: (params: { audio: string; language?: string }) =>
    ipcRenderer.invoke('whisper:transcribe', params),
  onToggleInputPanel: (callback: () => void) => {
    ipcRenderer.on('toggle-input-panel', callback)
    return () => { ipcRenderer.removeListener('toggle-input-panel', callback) }
  },
})
