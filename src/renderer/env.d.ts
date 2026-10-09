/// <reference types="vite/client" />

// CSSProperties 扩展 Webkit 前缀属性（Electron 窗口拖拽用）
type ElectronCSSProperties = import('react').CSSProperties & {
  WebkitAppRegion?: 'drag' | 'no-drag'
}

interface ChatMessage { role: string; content: string }

interface TestResult { ok: boolean; message: string }

interface OllamaModelsResult { ok: boolean; models: string[]; message?: string }

interface EncryptResult { ok: boolean; data?: string; message?: string }

interface ElectronAPI {
  hideWindow: () => Promise<void>
  moveWindow: (delta: { dx: number; dy: number }) => Promise<void>
  openSettings: () => Promise<void>
  closeSettings: () => Promise<void>
  resizeForSettings: () => Promise<void>
  resizeForBubble: () => Promise<void>
  resizeForOnboarding: () => Promise<void>
  resizeForInput: () => Promise<void>
  updateHotkey: (hotkey: string) => Promise<{ ok: boolean; message?: string }>
  updateVoiceHotkey: (hotkey: string) => Promise<{ ok: boolean; message?: string }>
  onToggleVoiceInput: (callback: () => void) => () => void
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
  encryptApiKey: (plain: string) => Promise<EncryptResult>
  decryptApiKey: (encoded: string) => Promise<EncryptResult>
  captureDesktopForGlass: () => Promise<{ ok: boolean; data?: string; message?: string }>
  webSearch: (params: {
    query: string
    provider: string
    apiKey: string
    instanceUrl?: string
    maxResults?: number
    timeout?: number
  }) => Promise<{
    ok: boolean
    results: { title: string; url: string; snippet: string; source?: string; score?: number }[]
    message?: string
    quotaRemaining?: number
  }>
  whisperTranscribe: (params: { audio: string; language?: string }) => Promise<{
    ok: boolean
    text: string
    message?: string
  }>
  onToggleInputPanel: (callback: () => void) => () => void
}

interface Window {
  electronAPI: ElectronAPI
}
