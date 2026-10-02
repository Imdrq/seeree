import { useEffect, useState } from 'react'
import { useAIConfig } from '../hooks/useAIConfig'
import type { AIConfig } from '../hooks/useAIConfig'
import LiquidGlassCanvas from './LiquidGlassCanvas'

/* ═══════════ 常量 ═══════════ */

const providerLabels: Record<AIConfig['provider'], string> = {
  openai: 'OpenAI',
  ollama: 'Ollama',
  claude: 'Claude',
  custom: 'Custom',
}

const isOllama = (p: AIConfig['provider']) => p === 'ollama'

type SectionKey = 'api' | 'network' | 'other'

interface NavItem {
  key: SectionKey
  label: string
  icon: JSX.Element
}

/* ═══════════ 图标 ═══════════ */

function IconAPI() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

function IconNetwork() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}

function IconOther() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

const NAV_ITEMS: NavItem[] = [
  { key: 'api', label: 'API 连接', icon: <IconAPI /> },
  { key: 'network', label: '联网设置', icon: <IconNetwork /> },
  { key: 'other', label: '其他设置', icon: <IconOther /> },
]

/* ═══════════ 主组件 ═══════════ */

export default function ControlPanel({ onClose }: { onClose: () => void }): JSX.Element {
  const {
    config, updateConfig, saveConfig, testConnection, models,
    ollamaLoading, ollamaError, refreshOllamaModels,
  } = useAIConfig()
  const [activeSection, setActiveSection] = useState<SectionKey>('api')
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null)

  // 切到 Ollama 时自动加载本地模型列表
  useEffect(() => {
    if (isOllama(config.provider)) {
      refreshOllamaModels()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.provider])

  const handleSave = async () => {
    await saveConfig()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    const result = await testConnection()
    setTestResult(result)
    setTesting(false)
  }

  const handleRefreshModels = async () => {
    setRefreshMsg(null)
    const result = await refreshOllamaModels()
    setRefreshMsg(result.message)
    setTimeout(() => setRefreshMsg(null), 3000)
  }

  return (
    <div style={outerStyle}>
      <div style={roundedShell}>
        {/* WebGL Liquid Glass 玻璃着色器 */}
        <LiquidGlassCanvas
          width={680}
          height={480}
          radius={0}
          tintAmount={0.10}
          saturation={1.12}
        />
        {/* ═══ 标题栏 ═══ */}
        <div style={{ ...titleBarStyle, WebkitAppRegion: 'drag', position: 'relative', zIndex: 2 } as any}>
          <span style={titleBarText}>Seeree · 设置</span>
          <button onClick={onClose} title="关闭" style={closeBtnStyle}>&#10005;</button>
        </div>

        {/* ═══ 主体：侧边栏 + 内容 ═══ */}
        <div style={{ ...bodyStyle, position: 'relative', zIndex: 2 }}>

          {/* ─── 侧边栏 ─── */}
          <nav style={sidebarStyle}>
            <div style={sidebarTitle}>设置</div>
            <div style={navList}>
              {NAV_ITEMS.map((item) => {
                const active = activeSection === item.key
                return (
                  <button
                    key={item.key}
                    onClick={() => setActiveSection(item.key)}
                    style={{
                      ...navItem,
                      background: active
                        ? 'rgba(255,255,255,0.14)'
                        : 'transparent',
                      color: active ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.5)',
                      boxShadow: active
                        ? 'inset 0 1px 0 rgba(255,255,255,0.12), 0 2px 8px rgba(0,0,0,0.12)'
                        : 'none',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', opacity: active ? 1 : 0.7 }}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </div>
            <div style={sidebarFooter}>
              <span style={versionText}>Seeree 0.0.2</span>
            </div>
          </nav>

          {/* ─── 内容区 ─── */}
          <main style={contentStyle}>
            {activeSection === 'api' && (
              <APISection
                config={config}
                updateConfig={updateConfig}
                models={models}
                ollamaLoading={ollamaLoading}
                ollamaError={ollamaError}
                refreshMsg={refreshMsg}
                onRefreshModels={handleRefreshModels}
                onTest={handleTest}
                onSave={handleSave}
                testing={testing}
                saved={saved}
                testResult={testResult}
              />
            )}
            {activeSection === 'network' && <NetworkSection />}
            {activeSection === 'other' && <OtherSection />}
          </main>
        </div>
      </div>
    </div>
  )
}

/* ═══════════ API 连接 ═══════════ */

function APISection(props: {
  config: AIConfig
  updateConfig: (patch: Partial<AIConfig>) => void
  models: string[]
  ollamaLoading: boolean
  ollamaError: string | null
  refreshMsg: string | null
  onRefreshModels: () => void
  onTest: () => void
  onSave: () => void
  testing: boolean
  saved: boolean
  testResult: { ok: boolean; message: string } | null
}) {
  const { config, updateConfig, models, ollamaLoading, ollamaError, refreshMsg,
    onRefreshModels, onTest, onSave, testing, saved, testResult } = props

  return (
    <>
      <PageHeader title="API 连接" subtitle="配置 AI 服务提供商与模型" />

      {/* Provider 选择 */}
      <GroupHeader>服务商</GroupHeader>
      <Group>
        <Row label="AI Provider">
          <div style={providerRow}>
            {(Object.keys(providerLabels) as AIConfig['provider'][]).map((key) => (
              <button
                key={key}
                onClick={() => updateConfig({ provider: key })}
                style={{
                  ...providerBtn,
                  background: config.provider === key ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)',
                  borderColor: config.provider === key ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.08)',
                  color: config.provider === key ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)',
                }}
              >
                {providerLabels[key]}
              </button>
            ))}
          </div>
        </Row>

        {isOllama(config.provider) && (
          <RowDivider />
        )}
        {isOllama(config.provider) && (
          <Row label="服务地址">
            <input
              type="text"
              value={config.baseUrl}
              onChange={(e) => updateConfig({ baseUrl: e.target.value })}
              placeholder="http://localhost:11434"
              style={inputInline}
            />
          </Row>
        )}
      </Group>
      {isOllama(config.provider) && (
        <GroupFooter>需先安装并运行 Ollama 服务（默认端口 11434）</GroupFooter>
      )}

      {/* 模型 */}
      <GroupHeader>模型</GroupHeader>
      <Group>
        <Row label={isOllama(config.provider) ? '本地模型' : 'Model'}>
          {isOllama(config.provider) ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', maxWidth: 240 }}>
              <div style={{ ...selectWrap, flex: 1 }}>
                <select
                  value={config.model}
                  onChange={(e) => updateConfig({ model: e.target.value })}
                  style={selectStyle}
                  disabled={ollamaLoading}
                >
                  {ollamaLoading ? (
                    <option value="">读取中...</option>
                  ) : models.length > 0 ? (
                    models.map((m) => (<option key={m} value={m}>{m}</option>))
                  ) : (
                    <option value="">未检测到模型</option>
                  )}
                </select>
                <span style={chevron}>&#9662;</span>
              </div>
              <button onClick={onRefreshModels} disabled={ollamaLoading} style={iconBtn} title="刷新模型列表">
                {ollamaLoading ? '···' : '↻'}
              </button>
            </div>
          ) : (
            <div style={{ ...selectWrap, width: '100%', maxWidth: 240 }}>
              <select value={config.model} onChange={(e) => updateConfig({ model: e.target.value })} style={selectStyle}>
                {models.map((m) => (<option key={m} value={m}>{m}</option>))}
              </select>
              <span style={chevron}>&#9662;</span>
            </div>
          )}
        </Row>
      </Group>
      {isOllama(config.provider) && ollamaError && <GroupFooter error>{ollamaError}</GroupFooter>}
      {isOllama(config.provider) && refreshMsg && <GroupFooter ok>{refreshMsg}</GroupFooter>}

      {/* API Key */}
      <GroupHeader>凭证</GroupHeader>
      <Group>
        {isOllama(config.provider) ? (
          <Row label="API Key">
            <span style={badgeOk}>&#10003;&ensp;本地服务，无需 API Key</span>
          </Row>
        ) : (
          <Row label="API Key">
            <input
              type="password"
              value={config.apiKey}
              onChange={(e) => updateConfig({ apiKey: e.target.value })}
              placeholder="sk-••••••••••••••••"
              style={inputInline}
            />
          </Row>
        )}
      </Group>
      <GroupFooter>API Key 通过系统加密存储，仅用于 AI 调用</GroupFooter>

      {/* 操作 */}
      <div style={buttonRow}>
        <button onClick={onTest} disabled={testing} style={btnSecondary}>
          {testing ? '测试中…' : '测试连接'}
        </button>
        <button onClick={onSave} style={btnPrimary}>
          {saved ? '✓ 已保存' : '保存配置'}
        </button>
      </div>

      {testResult && (
        <div style={{
          ...resultBanner,
          background: testResult.ok ? 'rgba(52,199,89,0.1)' : 'rgba(255,69,58,0.1)',
          borderColor: testResult.ok ? 'rgba(52,199,89,0.25)' : 'rgba(255,69,58,0.25)',
          color: testResult.ok ? 'rgba(52,199,89,0.9)' : 'rgba(255,99,71,0.85)',
        }}>
          {testResult.message}
        </div>
      )}
    </>
  )
}

/* ═══════════ 联网设置（预留） ═══════════ */

function NetworkSection() {
  const { searchConfig, updateSearchConfig } = useAIConfig()
  const quotaUsed = searchConfig.quotaUsed
  const quotaLimit = searchConfig.quotaLimit
  const quotaRemaining = quotaLimit - quotaUsed
  const quotaWarning = quotaRemaining <= searchConfig.warnThreshold
  const pct = Math.min(100, Math.round((quotaUsed / quotaLimit) * 100))

  return (
    <>
      <PageHeader title="联网设置" subtitle="联网搜索与外部服务" />

      <GroupHeader>网络搜索</GroupHeader>
      <Group>
        <Row label="启用搜索">
          <button
            onClick={() => updateSearchConfig({ enabled: !searchConfig.enabled })}
            style={{
              padding: '5px 16px', borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.12)',
              background: searchConfig.enabled ? 'rgba(52,199,89,0.15)' : 'rgba(255,255,255,0.06)',
              color: searchConfig.enabled ? 'rgba(52,199,89,0.9)' : 'rgba(255,255,255,0.4)',
              fontSize: 12, fontWeight: 500, cursor: 'pointer', outline: 'none',
            }}
          >
            {searchConfig.enabled ? '已启用' : '已禁用'}
          </button>
        </Row>

        <RowDivider />

        <Row label="搜索引擎">
          <select
            value={searchConfig.provider}
            onChange={(e) => updateSearchConfig({ provider: e.target.value as any })}
            style={{ ...selectStyle, maxWidth: 180 }}
          >
            <option value="searxng">SearXNG（免费）</option>
            <option value="tavily">Tavily</option>
            <option value="brave">Brave Search</option>
          </select>
        </Row>

        <RowDivider />

        {searchConfig.provider === 'searxng' ? (
          <Row label="实例地址">
            <input
              type="text"
              value={searchConfig.instanceUrl}
              onChange={(e) => updateSearchConfig({ instanceUrl: e.target.value })}
              placeholder="https://searx.be"
              style={{ ...inputInline, maxWidth: 240, fontSize: 11 }}
            />
          </Row>
        ) : (
          <Row label="API Key">
            <input
              type="password"
              value={searchConfig.apiKey}
              onChange={(e) => updateSearchConfig({ apiKey: e.target.value })}
              placeholder="tvly-••••••••••••"
              style={{ ...inputInline, maxWidth: 200 }}
            />
          </Row>
        )}
      </Group>
      {searchConfig.provider === 'searxng' && (
        <GroupFooter>SearXNG 免费无限制，支持自建实例。推荐：searx.be / priv.au / searx.tiekoetter.com</GroupFooter>
      )}

      <GroupHeader>本月用量</GroupHeader>
      <Group>
        <Row label="搜索次数">
          <div style={{ width: 160 }}>
            <div style={{
              height: 6, borderRadius: 3,
              background: 'rgba(255,255,255,0.1)',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: 3, width: `${pct}%`,
                background: quotaWarning ? 'rgba(255,180,50,0.8)' : 'rgba(52,199,89,0.7)',
                transition: 'width 0.3s ease',
              }} />
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
              {quotaUsed} / {quotaLimit} 次
            </div>
          </div>
        </Row>
      </Group>
      {quotaWarning && quotaRemaining > 0 && (
        <GroupFooter>⚠ 搜索额度不足，剩余 {quotaRemaining} 次</GroupFooter>
      )}
      {quotaRemaining <= 0 && (
        <GroupFooter error>本月搜索额度已用完，已自动降级为直接回答</GroupFooter>
      )}

      <GroupHeader>偏好</GroupHeader>
      <Group>
        <Row label="请求超时">
          <select
            value={searchConfig.timeout}
            onChange={(e) => updateSearchConfig({ timeout: Number(e.target.value) })}
            style={{ ...selectStyle, maxWidth: 120 }}
          >
            <option value={3000}>3 秒</option>
            <option value={5000}>5 秒</option>
            <option value={8000}>8 秒</option>
            <option value={10000}>10 秒</option>
          </select>
        </Row>
      </Group>
    </>
  )
}

/* ═══════════ 其他设置 ═══════════ */

function OtherSection() {
  const [lockResponse, setLockResponse] = useState(() => {
    try { return localStorage.getItem('seeree-lock-response') !== '0' } catch { return true }
  })
  const toggleLock = () => {
    const next = !lockResponse
    setLockResponse(next)
    localStorage.setItem('seeree-lock-response', next ? '1' : '0')
  }

  return (
    <>
      <PageHeader title="其他设置" subtitle="应用与关于" />

      <GroupHeader>交互</GroupHeader>
      <Group>
        <Row label="思考/播报中不可打断">
          <button
            onClick={toggleLock}
            style={{
              padding: '5px 16px', borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.12)',
              background: lockResponse ? 'rgba(52,199,89,0.15)' : 'rgba(255,255,255,0.06)',
              color: lockResponse ? 'rgba(52,199,89,0.9)' : 'rgba(255,255,255,0.4)',
              fontSize: 12, fontWeight: 500, cursor: 'pointer', outline: 'none',
            }}
          >
            {lockResponse ? '已开启' : '已关闭'}
          </button>
        </Row>
      </Group>
      <GroupFooter>开启后，AI 回答期间点击或按 Ctrl+T 不会中断回答</GroupFooter>

      <GroupHeader>应用</GroupHeader>
      <Group>
        <Row label="版本">
          <span style={valueText}>0.0.2</span>
        </Row>
        <RowDivider />
        <Row label="作者">
          <span style={valueText}>Ricky</span>
        </Row>
      </Group>

      <GroupHeader>操作</GroupHeader>
      <Group>
        <Row label="">
          <button
            onClick={() => window.electronAPI?.quitApp()}
            style={btnDanger}
          >
            退出应用
          </button>
        </Row>
      </Group>
      <GroupFooter>退出后将关闭悬浮球与托盘驻留</GroupFooter>
    </>
  )
}

/* ═══════════ 通用子组件 ═══════════ */

function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h1 style={pageTitle}>{title}</h1>
      {subtitle && <p style={pageSubtitle}>{subtitle}</p>}
    </div>
  )
}

function GroupHeader({ children }: { children: React.ReactNode }) {
  return <div style={groupHeader}>{children}</div>
}

function Group({ children }: { children: React.ReactNode }) {
  return <div style={groupCard}>{children}</div>
}

function GroupFooter({ children, error, ok }: { children: React.ReactNode; error?: boolean; ok?: boolean }) {
  return (
    <p style={{
      ...groupFooter,
      color: error ? 'rgba(255,99,71,0.75)' : ok ? 'rgba(52,199,89,0.8)' : 'rgba(255,255,255,0.3)',
    }}>
      {children}
    </p>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={rowStyle}>
      <span style={rowLabel}>{label}</span>
      <div style={rowControl}>{children}</div>
    </div>
  )
}

function RowDivider() {
  return <div style={rowDivider} />
}

/* ═══════════ 样式（Apple 风格） ═══════════ */

const fontFamily = '"Segoe UI Variable Text", "Segoe UI", -apple-system, "SF Pro Text", system-ui, sans-serif'

const outerStyle: any = {
  width: '100vw', height: '100vh',
  display: 'flex', alignItems: 'stretch', justifyContent: 'center',
  overflow: 'hidden',
  background: 'transparent',
  color: '#fff',
  fontFamily,
  WebkitFontSmoothing: 'antialiased',
  MozOsxFontSmoothing: 'grayscale',
  textRendering: 'optimizeLegibility' as const,
  letterSpacing: '0.01em',
}

const roundedShell: any = {
  flex: 1, display: 'flex', flexDirection: 'column',
  overflow: 'hidden',
  background: '#0e0e1a',
  WebkitAppRegion: 'no-drag',
}

const titleBarStyle: React.CSSProperties = {
  width: '100%', height: 44, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  position: 'relative',
}

const titleBarText: React.CSSProperties = {
  fontSize: 13.5, fontWeight: 600, color: 'rgba(255,255,255,0.48)', letterSpacing: '0.02em',
}

const closeBtnStyle: any = {
  position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
  width: 28, height: 28, borderRadius: 8,
  border: 'none', background: 'rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 13, outline: 'none',
  transition: 'all 0.15s ease',
  WebkitAppRegion: 'no-drag',
}

/* ─── 布局 ─── */

const bodyStyle: any = {
  flex: 1, display: 'flex', minHeight: 0,
  WebkitAppRegion: 'no-drag',
}

/* ─── 侧边栏 ─── */

const sidebarStyle: any = {
  width: 200, flexShrink: 0,
  display: 'flex', flexDirection: 'column',
  padding: '24px 14px 18px',
  background: 'rgba(255,255,255,0.08)',
  boxSizing: 'border-box',
}

const sidebarTitle: React.CSSProperties = {
  fontSize: 24, fontWeight: 700, letterSpacing: '-0.025em',
  color: 'rgba(255,255,255,0.92)',
  padding: '0 12px 20px',
}

const navList: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 3,
}

const navItem: any = {
  display: 'flex', alignItems: 'center', gap: 11,
  width: '100%', padding: '10px 13px',
  borderRadius: 9,
  border: 'none',
  fontSize: 13.5, fontWeight: 500,
  cursor: 'pointer', outline: 'none',
  transition: 'all 0.15s ease',
  textAlign: 'left',
  WebkitAppRegion: 'no-drag',
}

const sidebarFooter: React.CSSProperties = {
  marginTop: 'auto', padding: '14px 12px 0',
  borderTop: '1px solid rgba(255,255,255,0.05)',
}

const versionText: React.CSSProperties = {
  fontSize: 11.5, color: 'rgba(255,255,255,0.28)', fontWeight: 500,
  letterSpacing: '0.02em',
}

/* ─── 内容区 ─── */

const contentStyle: React.CSSProperties = {
  flex: 1, minWidth: 0,
  overflowY: 'auto', overflowX: 'hidden',
  padding: '26px 32px 36px',
  boxSizing: 'border-box',
}

const pageTitle: React.CSSProperties = {
  margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em',
  color: 'rgba(255,255,255,0.92)',
}

const pageSubtitle: React.CSSProperties = {
  margin: '6px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 400,
  letterSpacing: '0.01em',
}

/* ─── 分组（Apple inset grouped） ─── */

const groupHeader: React.CSSProperties = {
  fontSize: 11.5, fontWeight: 600, letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.38)',
  margin: '22px 0 8px', paddingLeft: 4,
}

const groupCard: React.CSSProperties = {
  borderRadius: 12,
  background: 'rgba(255,255,255,0.05)',
  overflow: 'hidden',
}

const groupFooter: React.CSSProperties = {
  margin: '8px 0 0', paddingLeft: 4,
  fontSize: 11.5, lineHeight: 1.55, fontWeight: 400,
  letterSpacing: '0.01em',
}

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '13px 16px', gap: 16, minHeight: 24,
}

const rowLabel: React.CSSProperties = {
  fontSize: 13.5, fontWeight: 500, color: 'rgba(255,255,255,0.72)',
  flexShrink: 0, letterSpacing: '0.01em',
}

const rowControl: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
  flex: 1, minWidth: 0,
}

const rowDivider: React.CSSProperties = {
  height: 1, background: 'rgba(255,255,255,0.06)',
  marginLeft: 16,
}

/* ─── 控件 ─── */

const providerRow: React.CSSProperties = {
  display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end',
}

const providerBtn: React.CSSProperties = {
  padding: '7px 16px', borderRadius: 8, border: '1.5px solid',
  fontSize: 12.5, fontWeight: 500, cursor: 'pointer', outline: 'none',
  transition: 'all 0.15s ease', whiteSpace: 'nowrap',
  letterSpacing: '0.01em',
}

const inputInline: React.CSSProperties = {
  width: '100%', maxWidth: 280,
  padding: '8px 12px', borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: 400,
  outline: 'none', boxSizing: 'border-box',
  fontFamily: '"Cascadia Code", "SF Mono", "Fira Code", Consolas, monospace',
  transition: 'border-color 0.15s ease',
  letterSpacing: '0.02em',
}

const selectWrap: React.CSSProperties = { position: 'relative', display: 'inline-block' }

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '8px 32px 8px 12px', borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: 500,
  outline: 'none', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none',
  boxSizing: 'border-box', letterSpacing: '0.01em',
}

const chevron: React.CSSProperties = {
  position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)',
  fontSize: 10, color: 'rgba(255,255,255,0.4)', pointerEvents: 'none',
}

const iconBtn: any = {
  width: 34, height: 34, borderRadius: 8, flexShrink: 0,
  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.7)', fontSize: 15, cursor: 'pointer', outline: 'none',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'all 0.15s ease',
}

const badgeOk: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 6,
  background: 'rgba(52,199,89,0.1)', border: '1px solid rgba(52,199,89,0.2)',
  color: 'rgba(52,199,89,0.85)', fontSize: 12, fontWeight: 500,
  letterSpacing: '0.01em',
}

const valueText: React.CSSProperties = {
  fontSize: 13.5, color: 'rgba(255,255,255,0.55)', fontWeight: 500,
  letterSpacing: '0.01em',
}

const comingSoon: React.CSSProperties = {
  fontSize: 12, color: 'rgba(255,255,255,0.3)', fontWeight: 500,
  padding: '4px 12px', borderRadius: 6,
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
  letterSpacing: '0.02em',
}

/* ─── 按钮 ─── */

const buttonRow: React.CSSProperties = {
  display: 'flex', gap: 12, marginTop: 26,
}

const btnBase: React.CSSProperties = {
  flex: 1, padding: '11px 0', borderRadius: 10, border: 'none',
  fontSize: 13.5, fontWeight: 600, cursor: 'pointer', outline: 'none',
  transition: 'all 0.15s ease', letterSpacing: '0.02em',
}

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  background: 'rgba(255,255,255,0.9)', color: 'rgba(20,10,40,0.92)',
}

const btnSecondary: React.CSSProperties = {
  ...btnBase,
  background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.75)',
  border: '1px solid rgba(255,255,255,0.1)',
}

const btnDanger: React.CSSProperties = {
  padding: '9px 22px', borderRadius: 8,
  border: '1px solid rgba(255,69,58,0.25)', background: 'rgba(255,69,58,0.1)',
  color: 'rgba(255,99,71,0.9)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  outline: 'none', transition: 'all 0.15s ease', letterSpacing: '0.02em',
}

const resultBanner: React.CSSProperties = {
  marginTop: 16, padding: '11px 16px', borderRadius: 10,
  border: '1px solid', fontSize: 12.5, fontWeight: 500, lineHeight: 1.55,
  letterSpacing: '0.01em',
}
