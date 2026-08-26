import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  setWindowSize: (size: { width: number; height: number }) =>
    ipcRenderer.invoke('set-window-size', size),
  captureDesktop: () => ipcRenderer.invoke('capture-desktop'),
  getWindowBounds: () => ipcRenderer.invoke('get-window-bounds'),
  moveWindow: (delta: { dx: number; dy: number }) => ipcRenderer.invoke('move-window', delta),
  openSettings: () => ipcRenderer.invoke('open-settings'),
  closeSettings: () => ipcRenderer.invoke('close-settings'),
  resizeForSettings: () => ipcRenderer.invoke('resize-for-settings'),
  resizeForBubble: () => ipcRenderer.invoke('resize-for-bubble'),
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
})
