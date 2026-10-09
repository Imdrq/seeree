import { useState, useEffect } from 'react'
import { useAIConfig, THEME_COLORS, type Lang } from '../hooks/useAIConfig'

const ONBOARDING_KEY = 'siri-onboarding-done'

export function isOnboardingDone(): boolean {
  try { return localStorage.getItem(ONBOARDING_KEY) === '1' } catch { return true }
}

const T = {
  zh: {
    welcome: '欢迎使用 Seeree',
    subtitle: '花一分钟设置你的偏好，随时可在设置中修改',
    stepLang: '选择语言',
    langZh: '中文',
    langZhDesc: '界面与语音以中文为主',
    langEn: 'English',
    langEnDesc: 'Interface in English',
    stepTheme: '选择主题',
    themePurple: '紫蓝色',
    themePurpleDesc: '深紫蓝玻璃质感',
    themeObsidian: '黑曜石',
    themeObsidianDesc: '纯黑极简风格',
    stepHotkey: '设置输入快捷键',
    pressCombo: '请按快捷键…',
    clickToRecord: '点击按钮录制你想要的快捷键组合',
    pressDesired: '请按下你想要的组合键（如 Ctrl+Shift+I）',
    hotkeyTip: '此快捷键打开输入面板，再按一次退出',
    stepVoice: '设置语音快捷键',
    clickToRecordVoice: '点击按钮录制语音输入快捷键',
    voiceHotkeyTip: '此快捷键直接启动语音对话',
    back: '上一步',
    next: '下一步',
    start: '开始使用',
  },
  en: {
    welcome: 'Welcome to Seeree',
    subtitle: 'Take a minute to set your preferences. Change them later in Settings.',
    stepLang: 'Choose Language',
    langZh: '中文',
    langZhDesc: 'Interface & voice in Chinese',
    langEn: 'English',
    langEnDesc: 'Interface in English',
    stepTheme: 'Choose Theme',
    themePurple: 'Purple Blue',
    themePurpleDesc: 'Deep purple glass',
    themeObsidian: 'Obsidian',
    themeObsidianDesc: 'Pure black minimal',
    stepHotkey: 'Set Input Hotkey',
    pressCombo: 'Press a key combo...',
    clickToRecord: 'Click the button, then press your desired hotkey',
    pressDesired: 'Press your desired key combo (e.g. Ctrl+Shift+I)',
    hotkeyTip: 'This hotkey opens the input panel. Press again to close.',
    stepVoice: 'Set Voice Hotkey',
    clickToRecordVoice: 'Click the button, then press your voice input hotkey',
    voiceHotkeyTip: 'This hotkey starts voice conversation directly',
    back: 'Back',
    next: 'Next',
    start: 'Get Started',
  },
}

export default function Onboarding({ onDone }: { onDone: () => void }): JSX.Element {
  const { theme, updateTheme, inputHotkey, updateInputHotkey, voiceHotkey, updateVoiceHotkey, lang, updateLang } = useAIConfig()
  const [step, setStep] = useState(0)
  const [recording, setRecording] = useState<'input' | 'voice' | null>(null)
  const t = T[lang]

  useEffect(() => {
    if (!recording) return
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') { setRecording(null); return }
      const parts: string[] = []
      if (e.ctrlKey) parts.push('Ctrl')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')
      if (e.metaKey) parts.push('Super')
      const key = e.key
      if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
        parts.push(key.length === 1 ? key.toUpperCase() : key)
        const combo = parts.join('+')
        if (recording === 'input') updateInputHotkey(combo)
        else if (recording === 'voice') updateVoiceHotkey(combo)
        setRecording(null)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [recording, updateInputHotkey, updateVoiceHotkey])

  const finish = () => {
    try { localStorage.setItem(ONBOARDING_KEY, '1') } catch { /* ignore */ }
    onDone()
  }

  const colors = THEME_COLORS[theme]
  const btnStyle = {
    cursor: 'pointer', outline: 'none',
    WebkitAppRegion: 'no-drag',
    transition: 'all 0.15s ease',
  } as any

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'transparent',
      WebkitAppRegion: 'no-drag',
    } as any}>
      <div style={{
        width: 520, borderRadius: 20,
        background: colors.settingsBg,
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        WebkitAppRegion: 'no-drag',
      } as any}>

        {/* 标题 */}
        <div style={{ padding: '32px 32px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'rgba(255,255,255,0.92)', letterSpacing: '-0.02em' }}>
            {t.welcome}
          </div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>
            {t.subtitle}
          </div>
        </div>

        {/* 步骤内容 */}
        <div style={{ padding: '28px 32px', flex: 1 }}>

          {/* Step 0: 语言 */}
          {step === 0 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.06em', marginBottom: 16 }}>
                {t.stepLang}
              </div>
              <div style={{ display: 'flex', gap: 14 }}>
                {([
                  { key: 'zh' as Lang, label: t.langZh, desc: t.langZhDesc },
                  { key: 'en' as Lang, label: t.langEn, desc: t.langEnDesc },
                ]).map((l) => (
                  <button
                    key={l.key}
                    onClick={() => updateLang(l.key)}
                    style={{
                      flex: 1, padding: '20px 16px', borderRadius: 14,
                      border: `2px solid ${lang === l.key ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.08)'}`,
                      background: lang === l.key ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                      ...btnStyle,
                      transform: lang === l.key ? 'scale(1.02)' : 'scale(1)',
                    }}
                  >
                    <div style={{ fontSize: 16, fontWeight: 600, color: lang === l.key ? '#ffffff' : 'rgba(255,255,255,0.5)' }}>
                      {l.label}
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
                      {l.desc}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Step 1: 主题 */}
          {step === 1 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.06em', marginBottom: 16 }}>
                {t.stepTheme}
              </div>
              <div style={{ display: 'flex', gap: 14 }}>
                {([
                  { key: 'purple-blue' as const, label: t.themePurple, desc: t.themePurpleDesc, preview: 'linear-gradient(135deg, #1a0a2e 0%, #0c0818 100%)' },
                  { key: 'obsidian' as const, label: t.themeObsidian, desc: t.themeObsidianDesc, preview: 'linear-gradient(135deg, #1a1a1a 0%, #000000 100%)' },
                ]).map((th) => (
                  <button
                    key={th.key}
                    onClick={() => updateTheme(th.key)}
                    style={{
                      flex: 1, padding: '20px 16px', borderRadius: 14,
                      border: `2px solid ${theme === th.key ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.08)'}`,
                      background: th.preview,
                      ...btnStyle,
                      transform: theme === th.key ? 'scale(1.02)' : 'scale(1)',
                    }}
                  >
                    <div style={{ fontSize: 16, fontWeight: 600, color: theme === th.key ? '#ffffff' : 'rgba(255,255,255,0.5)' }}>
                      {th.label}
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
                      {th.desc}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Step 2: 输入快捷键 */}
          {step === 2 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.06em', marginBottom: 16 }}>
                {t.stepHotkey}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '20px 0' }}>
                <button
                  onClick={() => setRecording('input')}
                  style={{
                    padding: '16px 40px', borderRadius: 14,
                    border: `2px solid ${recording === 'input' ? 'rgba(255,180,50,0.5)' : 'rgba(255,255,255,0.15)'}`,
                    background: recording === 'input' ? 'rgba(255,180,50,0.1)' : 'rgba(255,255,255,0.06)',
                    color: recording === 'input' ? 'rgba(255,180,50,0.9)' : '#ffffff',
                    fontSize: 20, fontWeight: 600, fontFamily: 'monospace',
                    ...btnStyle,
                    minWidth: 200,
                  }}
                >
                  {recording === 'input' ? t.pressCombo : inputHotkey}
                </button>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                  {recording === 'input' ? t.pressDesired : t.clickToRecord}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>
                  {t.hotkeyTip}
                </div>
              </div>
            </>
          )}

          {/* Step 3: 语音快捷键 */}
          {step === 3 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.06em', marginBottom: 16 }}>
                {t.stepVoice}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '20px 0' }}>
                <button
                  onClick={() => setRecording('voice')}
                  style={{
                    padding: '16px 40px', borderRadius: 14,
                    border: `2px solid ${recording === 'voice' ? 'rgba(255,180,50,0.5)' : 'rgba(255,255,255,0.15)'}`,
                    background: recording === 'voice' ? 'rgba(255,180,50,0.1)' : 'rgba(255,255,255,0.06)',
                    color: recording === 'voice' ? 'rgba(255,180,50,0.9)' : '#ffffff',
                    fontSize: 20, fontWeight: 600, fontFamily: 'monospace',
                    ...btnStyle,
                    minWidth: 200,
                  }}
                >
                  {recording === 'voice' ? t.pressCombo : voiceHotkey}
                </button>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                  {recording === 'voice' ? t.pressDesired : t.clickToRecordVoice}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>
                  {t.voiceHotkeyTip}
                </div>
              </div>
            </>
          )}
        </div>

        {/* 底部 */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 32px 28px',
          borderTop: '1px solid rgba(255,255,255,0.05)',
        }}>
          {/* 步骤指示 */}
          <div style={{ display: 'flex', gap: 6 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{
                width: 8, height: 8, borderRadius: 4,
                background: i === step ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)',
                transition: 'all 0.2s ease',
              }} />
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                style={{
                  padding: '10px 22px', borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'rgba(255,255,255,0.5)',
                  fontSize: 13, fontWeight: 500,
                  ...btnStyle,
                }}
              >
                {t.back}
              </button>
            )}
            {step < 3 ? (
              <button
                onClick={() => setStep(step + 1)}
                style={{
                  padding: '10px 28px', borderRadius: 10,
                  border: 'none',
                  background: 'rgba(255,255,255,0.12)',
                  color: '#ffffff',
                  fontSize: 13, fontWeight: 600,
                  ...btnStyle,
                }}
              >
                {t.next}
              </button>
            ) : (
              <button
                onClick={finish}
                style={{
                  padding: '10px 28px', borderRadius: 10,
                  border: 'none',
                  background: 'rgba(99,200,255,0.2)',
                  color: 'rgba(99,255,200,0.9)',
                  fontSize: 13, fontWeight: 600,
                  ...btnStyle,
                }}
              >
                {t.start}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
