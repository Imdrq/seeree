import { useState, useCallback, useRef, useEffect } from 'react'

export type AIProvider = 'openai' | 'ollama' | 'claude' | 'custom'

export interface AIConfig {
  provider: AIProvider
  model: string
  apiKey: string
  baseUrl: string
}

/** 联网搜索配置 */
export interface SearchConfig {
  enabled: boolean
  provider: 'tavily' | 'brave' | 'searxng'
  apiKey: string
  instanceUrl: string
  quotaLimit: number
  quotaUsed: number
  quotaMonth: string
  warnThreshold: number
  timeout: number
}

const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  enabled: false,
  provider: 'searxng',
  apiKey: '',
  instanceUrl: 'https://searx.be',
  quotaLimit: 10000,
  quotaUsed: 0,
  quotaMonth: '',
  warnThreshold: 5,
  timeout: 8000,
}

const SEARCH_STORAGE_KEY = 'siri-search-config'

const STATIC_MODELS: Record<AIProvider, string[]> = {
  openai: ['GPT-5', 'GPT-4o', 'GPT-4-turbo', 'GPT-3.5-turbo'],
  ollama: [], // 动态从本地 Ollama 获取
  claude: ['Claude 3.5 Sonnet', 'Claude 3.5 Haiku', 'Claude 3 Opus', 'Claude 3 Haiku'],
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
/** 旧版明文 apiKey 迁移用：迁移完成后从 localStorage 移除 */
const LEGACY_KEY = 'siri-ai-api-key'
/** 加密值前缀，用于区分密文与旧版明文 */
const ENC_PREFIX = 'enc:'

function loadConfigSync(): AIConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const merged = { ...DEFAULT_CONFIG, ...parsed } as AIConfig
      if (!merged.baseUrl) merged.baseUrl = DEFAULT_BASE_URL[merged.provider] || ''
      return merged
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_CONFIG }
}

export function useAIConfig() {
  const [config, setConfig] = useState<AIConfig>(loadConfigSync)
  const configRef = useRef(config)
  configRef.current = config

  // ── 联网搜索配置 ──
  const [searchConfig, setSearchConfig] = useState<SearchConfig>(() => {
    try {
      const raw = localStorage.getItem(SEARCH_STORAGE_KEY)
      if (raw) return { ...DEFAULT_SEARCH_CONFIG, ...JSON.parse(raw) }
    } catch { /* ignore */ }
    return { ...DEFAULT_SEARCH_CONFIG }
  })
  const searchConfigRef = useRef(searchConfig)
  searchConfigRef.current = searchConfig

  const updateSearchConfig = useCallback((patch: Partial<SearchConfig>) => {
    setSearchConfig(prev => {
      const next = { ...prev, ...patch }
      searchConfigRef.current = next
      localStorage.setItem(SEARCH_STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  // 动态 Ollama 模型列表（本地已安装）
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [ollamaLoading, setOllamaLoading] = useState(false)
  const [ollamaError, setOllamaError] = useState<string | null>(null)

  // ── API Key 加密解密（safeStorage 走主进程） ──
  const encryptKey = useCallback(async (plain: string): Promise<string> => {
    if (!plain) return ''
    if (plain.startsWith(ENC_PREFIX)) return plain // 已加密
    const api = window.electronAPI
    if (!api?.encryptApiKey) return plain // 无加密能力时退化为明文
    try {
      const res = await api.encryptApiKey(plain)
      return res.ok && res.data ? ENC_PREFIX + res.data : plain
    } catch {
      return plain
    }
  }, [])

  const decryptKey = useCallback(async (stored: string): Promise<string> => {
    if (!stored) return ''
    if (!stored.startsWith(ENC_PREFIX)) return stored // 旧版明文，直接用
    const api = window.electronAPI
    if (!api?.decryptApiKey) return stored.slice(ENC_PREFIX.length)
    try {
      const res = await api.decryptApiKey(stored.slice(ENC_PREFIX.length))
      return res.ok && res.data ? res.data : ''
    } catch {
      return ''
    }
  }, [])

  // 启动时解密 apiKey 到运行时状态，并迁移旧版明文存储
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const cur = configRef.current
      if (!cur.apiKey) return
      const plain = await decryptKey(cur.apiKey)
      if (cancelled) return
      // 运行时始终使用明文
      const nextRuntime = { ...configRef.current, apiKey: plain }
      configRef.current = nextRuntime
      setConfig(nextRuntime)
      // 持久化时加密写回
      if (cur.apiKey !== plain) {
        const encrypted = await encryptKey(plain)
        if (!cancelled) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...nextRuntime, apiKey: encrypted }))
          localStorage.removeItem(LEGACY_KEY)
        }
      }
    })()
    return () => { cancelled = true }
  }, [decryptKey, encryptKey])

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
          // 后台解密，保证 chatCompletion 能拿到明文
          if (updated.apiKey) {
            decryptKey(updated.apiKey).then((plain) => {
              if (plain !== updated.apiKey) {
                configRef.current = { ...configRef.current, apiKey: plain }
                setConfig((c) => ({ ...c, apiKey: plain }))
              }
            })
          }
        } catch { /* ignore */ }
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [decryptKey])

  const updateConfig = useCallback((patch: Partial<AIConfig>) => {
    setConfig(prev => {
      const next = { ...prev, ...patch }
      if (patch.provider && patch.provider !== prev.provider) {
        next.model = STATIC_MODELS[patch.provider][0] || ''
        if (patch.provider === 'ollama') next.baseUrl = DEFAULT_BASE_URL.ollama
        if (patch.provider === 'openai') next.baseUrl = next.baseUrl || ''
      }
      configRef.current = next
      return next
    })
  }, [])

  const saveConfig = useCallback(async () => {
    const cur = configRef.current
    // 持久化时加密 apiKey，运行时 configRef 仍保留明文供调用
    const encrypted = await encryptKey(cur.apiKey)
    const toStore = { ...cur, apiKey: encrypted }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore))
    localStorage.removeItem(LEGACY_KEY)
    return true
  }, [encryptKey])

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
    searchConfig, updateSearchConfig,
  }
}
