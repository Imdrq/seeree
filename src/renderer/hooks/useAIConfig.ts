import { useState, useCallback, useRef, useEffect } from 'react'

export type AIProvider = 'openai' | 'ollama' | 'claude' | 'custom'

export interface AIConfig {
  provider: AIProvider
  model: string
  apiKey: string
  baseUrl: string
}

const STATIC_MODELS: Record<AIProvider, string[]> = {
  openai: ['GPT-5', 'GPT-4o', 'GPT-4-turbo', 'GPT-3.5-turbo'],
  ollama: [], // 动态从本地 Ollama 获取
  claude: ['Claude 3.5 Sonnet', 'Claude 3 Opus', 'Claude 3 Haiku'],
  custom: ['custom-model'],
}

const DEFAULT_BASE_URL: Record<AIProvider, string> = {
  openai: '',
  ollama: 'http://localhost:11434',
  claude: '',
  custom: '',
}

const DEFAULT_CONFIG: AIConfig = {
  provider: 'openai',
  model: 'GPT-5',
  apiKey: '',
  baseUrl: '',
}

const STORAGE_KEY = 'siri-ai-config'

function loadConfig(): AIConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const merged = { ...DEFAULT_CONFIG, ...parsed } as AIConfig
      // 兼容旧版本：无 baseUrl 时按 provider 补默认值
      if (!merged.baseUrl) merged.baseUrl = DEFAULT_BASE_URL[merged.provider] || ''
      return merged
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_CONFIG }
}

export function useAIConfig() {
  const [config, setConfig] = useState<AIConfig>(loadConfig)
  const configRef = useRef(config)
  configRef.current = config  // 始终指向最新值

  // 动态 Ollama 模型列表（本地已安装）
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [ollamaLoading, setOllamaLoading] = useState(false)
  const [ollamaError, setOllamaError] = useState<string | null>(null)

  // 跨窗口同步：设置窗口保存后，气泡窗口实时读取
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue)
          const updated = { ...DEFAULT_CONFIG, ...parsed } as AIConfig
          if (!updated.baseUrl) updated.baseUrl = DEFAULT_BASE_URL[updated.provider] || ''
          setConfig(updated)
          configRef.current = updated
        } catch { /* ignore */ }
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const updateConfig = useCallback((patch: Partial<AIConfig>) => {
    setConfig(prev => {
      const next = { ...prev, ...patch }
      if (patch.provider && patch.provider !== prev.provider) {
        // 切换 provider：重置模型为首选，并补 baseUrl 默认值
        next.model = STATIC_MODELS[patch.provider][0] || ''
        if (patch.provider === 'ollama') next.baseUrl = DEFAULT_BASE_URL.ollama
        if (patch.provider === 'openai') next.baseUrl = next.baseUrl || ''
      }
      configRef.current = next
      return next
    })
  }, [])

  const saveConfig = useCallback(() => {
    // 用 ref 保证总是拿到最新值，不受闭包影响
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configRef.current))
    return true
  }, [])

  /** 刷新 Ollama 本地模型列表；成功且当前模型不在列表中时自动切换 */
  const refreshOllamaModels = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    const cfg = configRef.current
    if (!window.electronAPI?.listOllamaModels) {
      setOllamaError('Electron 环境未就绪')
      return { ok: false, message: 'Electron 环境未就绪' }
    }
    setOllamaLoading(true)
    setOllamaError(null)
    try {
      const res = await window.electronAPI.listOllamaModels(cfg.baseUrl)
      if (res.ok) {
        setOllamaModels(res.models)
        if (res.models.length > 0) {
          const cur = configRef.current.model
          if (!res.models.includes(cur)) {
            updateConfig({ model: res.models[0] })
          }
        } else {
          setOllamaError('Ollama 未安装任何模型，请先运行: ollama pull <模型名>')
        }
        return { ok: true, message: `已加载 ${res.models.length} 个模型` }
      }
      setOllamaError(res.message || '获取模型列表失败')
      return { ok: false, message: res.message || '获取模型列表失败' }
    } catch (err: any) {
      const msg = err?.message || '获取模型列表异常'
      setOllamaError(msg)
      return { ok: false, message: msg }
    } finally {
      setOllamaLoading(false)
    }
  }, [updateConfig])

  /** 当前 provider 可用模型列表 */
  const models = config.provider === 'ollama' && ollamaModels.length > 0
    ? ollamaModels
    : STATIC_MODELS[config.provider]

  /** 是否已具备调用 AI 的配置 */
  const isConfigured = config.provider === 'ollama'
    ? !!config.baseUrl.trim()
    : !!config.apiKey.trim()

  const testConnection = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    const cfg = configRef.current
    if (!window.electronAPI) {
      return { ok: false, message: 'Electron 环境未就绪' }
    }
    try {
      return await window.electronAPI.testConnection({
        provider: cfg.provider,
        model: cfg.model,
        apiKey: cfg.apiKey,
        baseUrl: cfg.baseUrl,
      })
    } catch (err: any) {
      return { ok: false, message: err?.message || '连接异常' }
    }
  }, [])

  return {
    config, updateConfig, saveConfig, testConnection,
    models, isConfigured,
    ollamaModels, ollamaLoading, ollamaError, refreshOllamaModels,
  }
}
