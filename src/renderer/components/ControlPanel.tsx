import { useEffect, useState } from 'react'
import { useAIConfig } from '../hooks/useAIConfig'
import type { AIConfig } from '../hooks/useAIConfig'

const providerLabels: Record<AIConfig['provider'], string> = {
  openai: 'OpenAI',
  ollama: 'Ollama',
  claude: 'Claude',
  custom: 'Custom',
}

const isOllama = (p: AIConfig['provider']) => p === 'ollama'

export default function ControlPanel({ onClose }: { onClose: () => void }): JSX.Element {
  const {
    config, updateConfig, saveConfig, testConnection, models,
    ollamaLoading, ollamaError, refreshOllamaModels,
  } = useAIConfig()
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

  const handleSave = () => {
    saveConfig()
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
      {/* ═══ 标题栏 ═══ */}
      <div style={{ ...titleBarStyle, WebkitAppRegion: 'drag' as any }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.04em' }}>
          Seeree · AI 设置
        </span>
        <button
          onClick={onClose}
          title="关闭"
          style={closeBtnStyle}
        >&#10005;</button>
      </div>

      {/* ═══ 卡片内容 ═══ */}
      <div style={containerStyle}>
      <div style={cardStyle}>
        <h2 style={titleStyle}>AI 设置</h2>

        {/* Provider */}
        <Section label="AI Provider">
          <div style={providerRowStyle}>
            {(Object.keys(providerLabels) as AIConfig['provider'][]).map((key) => (
              <button
                key={key}
                onClick={() => updateConfig({ provider: key })}
                style={{
                  ...providerBtnStyle,
                  background: config.provider === key ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.04)',
                  borderColor: config.provider === key ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.06)',
                  color: config.provider === key ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.45)',
                }}
              >
                {providerLabels[key]}
              </button>
            ))}
          </div>
        </Section>

        {/* Base URL（仅 Ollama 显示） */}
        {isOllama(config.provider) && (
          <Section label="Ollama 服务地址 (Base URL)">
            <input
              type="text"
              value={config.baseUrl}
              onChange={(e) => updateConfig({ baseUrl: e.target.value })}
              placeholder="http://localhost:11434"
              style={inputStyle}
            />
            <p style={subHintStyle}>Ollama 为本地服务，需先安装并运行 Ollama（默认端口 11434）</p>
          </Section>
        )}

        {/* Model */}
        <Section label={isOllama(config.provider) ? 'Model（本地已安装）' : 'Model'}>
          {isOllama(config.provider) ? (
            <div style={ollamaModelRowStyle}>
              <div style={{ ...selectWrapperStyle, flex: 1 }}>
                <select
                  value={config.model}
                  onChange={(e) => updateConfig({ model: e.target.value })}
                  style={selectStyle}
                  disabled={ollamaLoading}
                >
                  {ollamaLoading ? (
                    <option value="">正在读取模型列表...</option>
                  ) : models.length > 0 ? (
                    models.map((m) => (<option key={m} value={m}>{m}</option>))
                  ) : (
                    <option value="">未检测到模型</option>
                  )}
                </select>
                <span style={chevronStyle}>&#9662;</span>
              </div>
              <button onClick={handleRefreshModels} disabled={ollamaLoading} style={refreshBtnStyle} title="刷新模型列表">
                {ollamaLoading ? '...' : '&#8635;'}
              </button>
            </div>
          ) : (
            <div style={selectWrapperStyle}>
              <select value={config.model} onChange={(e) => updateConfig({ model: e.target.value })} style={selectStyle}>
                {models.map((m) => (<option key={m} value={m}>{m}</option>))}
              </select>
              <span style={chevronStyle}>&#9662;</span>
            </div>
          )}
          {isOllama(config.provider) && ollamaError && (
            <p style={errorHintStyle}>{ollamaError}</p>
          )}
          {isOllama(config.provider) && refreshMsg && (
            <p style={okHintStyle}>{refreshMsg}</p>
          )}
        </Section>

        {/* API Key（Ollama 无需） */}
        {isOllama(config.provider) ? (
          <Section label="API Key">
            <div style={noKeyBadgeStyle}>&#10003; 本地服务，无需 API Key</div>
          </Section>
        ) : (
          <Section label={providerLabels[config.provider] + ' API Key'}>
            <input
              type="password"
              value={config.apiKey}
              onChange={(e) => updateConfig({ apiKey: e.target.value })}
              placeholder="sk-••••••••••••••••••••••"
              style={inputStyle}
            />
          </Section>
        )}

        {/* 按钮组 */}
        <div style={buttonRowStyle}>
          <button onClick={handleTest} disabled={testing} style={testBtnStyle}>
            {testing ? '测试中...' : '测试连接'}
          </button>
          <button onClick={handleSave} style={saveBtnStyle}>
            {saved ? '&#10003; 已保存' : '保存配置'}
          </button>
        </div>

        {/* 结果 */}
        {testResult && (
          <div style={{
            ...resultBannerStyle,
            background: testResult.ok ? 'rgba(52,199,89,0.12)' : 'rgba(255,69,58,0.12)',
            borderColor: testResult.ok ? 'rgba(52,199,89,0.3)' : 'rgba(255,69,58,0.3)',
            color: testResult.ok ? 'rgba(52,199,89,0.9)' : 'rgba(255,69,58,0.85)',
          }}>
            {testResult.message}
          </div>
        )}

        <p style={hintStyle}>配置保存在本地，仅用于 AI 功能调用</p>

        <button onClick={() => window.electronAPI?.quitApp()} style={quitBtnStyle} title="完全退出 Seeree">
          退出应用
        </button>
      </div>
    </div>
    </div>
  )
}

/* ───────── 子组件 ───────── */
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

/* ───────── 样式 ───────── */

const outerStyle: React.CSSProperties = {
  width: '100vw', height: '100vh',
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  overflow: 'hidden',
  background: '#0d0d1f',
}

const titleBarStyle: React.CSSProperties = {
  width: '100%', height: 44, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  position: 'relative',
  cursor: 'default',
}

const closeBtnStyle: React.CSSProperties = {
  position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
  width: 28, height: 28, borderRadius: 8,
  border: 'none', background: 'rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 14, outline: 'none',
  WebkitAppRegion: 'no-drag' as any,
}

const containerStyle: React.CSSProperties = {
  width: '100%', height: '100%',
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'flex-start',
  paddingTop: 12, paddingBottom: 24,
  boxSizing: 'border-box',
  overflowY: 'auto', overflowX: 'hidden',
  WebkitAppRegion: 'no-drag' as any,
}

const cardStyle: React.CSSProperties = {
  width: '100%', padding: '28px 24px 22px', borderRadius: 24,
  background: 'rgba(20,10,40,0.85)',
  border: '1px solid rgba(255,255,255,0.08)',
  boxShadow: ['inset 0 1px 0 rgba(255,255,255,0.06)', '0 8px 40px rgba(0,0,0,0.3)'].join(', '),
  color: '#fff',
  fontFamily: '-apple-system, "Segoe UI", system-ui, sans-serif',
}

const titleStyle: React.CSSProperties = {
  margin: '0 0 22px', fontSize: 17, fontWeight: 600,
  letterSpacing: '-0.01em', color: 'rgba(255,255,255,0.85)',
}

const providerRowStyle: React.CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap' }

const providerBtnStyle: React.CSSProperties = {
  flex: 1, padding: '8px 6px', borderRadius: 10, border: '1.5px solid',
  fontSize: 12, fontWeight: 500, cursor: 'pointer', outline: 'none',
  transition: 'all 0.18s ease', background: 'transparent', whiteSpace: 'nowrap', minWidth: 0,
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
  color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 8,
}

const selectWrapperStyle: React.CSSProperties = { position: 'relative', display: 'inline-block', width: '100%' }

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', paddingRight: 36, borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: 500,
  outline: 'none', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none',
}

const chevronStyle: React.CSSProperties = {
  position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
  fontSize: 10, color: 'rgba(255,255,255,0.35)', pointerEvents: 'none',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 400,
  outline: 'none', boxSizing: 'border-box',
  fontFamily: 'SF Mono, "Fira Code", monospace',
}

const ollamaModelRowStyle: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center' }

const refreshBtnStyle: React.CSSProperties = {
  width: 38, height: 40, borderRadius: 12, flexShrink: 0,
  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.7)', fontSize: 15, cursor: 'pointer', outline: 'none',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'all 0.15s ease',
}

const noKeyBadgeStyle: React.CSSProperties = {
  padding: '10px 14px', borderRadius: 12,
  border: '1px solid rgba(52,199,89,0.25)', background: 'rgba(52,199,89,0.08)',
  color: 'rgba(52,199,89,0.85)', fontSize: 12, fontWeight: 500,
}

const subHintStyle: React.CSSProperties = {
  margin: '6px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.3)',
}

const errorHintStyle: React.CSSProperties = {
  margin: '6px 0 0', fontSize: 11, color: 'rgba(255,99,71,0.8)', lineHeight: 1.4,
}

const okHintStyle: React.CSSProperties = {
  margin: '6px 0 0', fontSize: 11, color: 'rgba(52,199,89,0.8)',
}

const buttonRowStyle: React.CSSProperties = { display: 'flex', gap: 10, marginTop: 24, marginBottom: 10 }

const baseBtn: React.CSSProperties = {
  flex: 1, padding: '11px 0', borderRadius: 12, border: 'none',
  fontSize: 14, fontWeight: 600, cursor: 'pointer', outline: 'none',
  transition: 'all 0.15s ease',
}

const testBtnStyle: React.CSSProperties = {
  ...baseBtn, background: 'rgba(255,255,255,0.08)',
  color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)',
}

const saveBtnStyle: React.CSSProperties = {
  ...baseBtn, background: 'rgba(255,255,255,0.85)', color: 'rgba(20,10,40,0.9)',
}

const resultBannerStyle: React.CSSProperties = {
  marginTop: 12, padding: '10px 14px', borderRadius: 10,
  border: '1px solid', fontSize: 12, fontWeight: 500, lineHeight: 1.5,
}

const hintStyle: React.CSSProperties = {
  margin: '12px 0 0', fontSize: 10, color: 'rgba(255,255,255,0.2)', textAlign: 'center',
}

const quitBtnStyle: React.CSSProperties = {
  marginTop: 16, padding: '10px 0', width: '100%', borderRadius: 12,
  border: '1px solid rgba(255,69,58,0.3)', background: 'rgba(255,69,58,0.1)',
  color: 'rgba(255,99,71,0.9)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  outline: 'none', transition: 'all 0.15s ease',
}
