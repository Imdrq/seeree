/// <reference types="vite/client" />

interface ChatMessage { role: string; content: string }

interface TestResult { ok: boolean; message: string }

interface OllamaModelsResult { ok: boolean; models: string[]; message?: string }

interface ElectronAPI {
  hideWindow: () => Promise<void>
  setWindowSize: (size: { width: number; height: number }) => Promise<void>
  captureDesktop: () => Promise<string>
  getWindowBounds: () => Promise<{ x: number; y: number; width: number; height: number }>
  moveWindow: (delta: { dx: number; dy: number }) => Promise<void>
  openSettings: () => Promise<void>
  closeSettings: () => Promise<void>
  resizeForSettings: () => Promise<void>
  resizeForBubble: () => Promise<void>
  quitApp: () => Promise<void>
  testConnection: (params: { provider: string; model: string; apiKey: string; baseUrl: string }) => Promise<TestResult>
  listOllamaModels: (baseUrl: string) => Promise<OllamaModelsResult>
  chatCompletion: (params: {
    provider: string
    apiKey: string
    model: string
    baseUrl: string
    messages: ChatMessage[]
  }) => Promise<string>
  abortChat: () => Promise<void>
  saveNote: (text: string) => Promise<{ ok: boolean; path?: string; message?: string }>
}

interface Window {
  electronAPI: ElectronAPI
}
