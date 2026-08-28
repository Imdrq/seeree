import { useState, useCallback, useEffect, useRef } from 'react'
import SiriWave from './SiriWave'
import useVoskRecognition from './useVoskRecognition'
import { useMicrophone } from './useMicrophone'
import { useAIConfig } from '../hooks/useAIConfig'

const W = 320
const H = 180

/* ═══════════ Web Speech API 封装 ═══════════ */

const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

function listenForSpeech(timeoutMs = 10000): Promise<{ text: string | null; error?: string }> {
  return new Promise((resolve) => {
    if (!SR) { resolve({ text: null, error: '当前环境不支持 Web Speech 语音识别' }); return }

    const recognition = new SR()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'zh-CN'

    const timer = setTimeout(() => {
      try { recognition.stop() } catch { /* ok */ }
      resolve({ text: null, error: '超时未检测到语音' })
    }, timeoutMs)

    recognition.onresult = (event: any) => {
      clearTimeout(timer)
      resolve({ text: event.results[0][0].transcript })
    }

    recognition.onerror = (e: any) => {
      clearTimeout(timer)
      const code = e?.error || 'unknown'
      const msg =
        code === 'not-allowed' ? '麦克风权限被拒绝，请检查系统麦克风权限' :
        code === 'network' ? '语音识别服务网络不可用（Web Speech 依赖云服务）' :
        code === 'service-not-allowed' ? '语音识别服务不可用（浏览器未授权）' :
        code === 'no-speech' ? '未检测到语音' :
        `语音识别错误: ${code}`
      resolve({ text: null, error: msg })
    }

    recognition.onend = () => {
      // no result → timeout will handle
    }

    try { recognition.start() } catch { clearTimeout(timer); resolve({ text: null, error: '语音识别启动失败' }) }
  })
}

function speakText(text: string, onProgress?: (charIndex: number) => void): Promise<void> {
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = 1.05
    utterance.pitch = 1.0

    // 优先用引擎的 boundary 事件做精确进度；引擎不支持时按平均语速估算
    let boundarySeen = false
    utterance.onboundary = (e: any) => {
      if (typeof e?.charIndex === 'number') {
        boundarySeen = true
        onProgress?.(e.charIndex)
      }
    }
    const estMs = 900 + (text.length * 170) / utterance.rate
    const startedAt = Date.now()
    const timer = setInterval(() => {
      if (boundarySeen) return
      const p = Math.min(1, (Date.now() - startedAt) / estMs)
      onProgress?.(Math.round(text.length * p))
    }, 120)

    utterance.onend = () => { clearInterval(timer); onProgress?.(text.length); resolve() }
    utterance.onerror = () => { clearInterval(timer); resolve() }
    window.speechSynthesis.speak(utterance)
  })
}

/** 去掉 AI 回复中的 emoji / 颜文字 / 图形符号（配合 system prompt 双保险） */
function stripEmoji(s: string): string {
  return s
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/* ═══════════ 记事意图检测 ═══════════ */

/** 触发"开始记录"的指令词：检测到后提示开始记录，用户说的下一句话将被保存 */
const NOTE_TRIGGER_KEYWORDS = [
  '记事', '记事本',
  '记一下', '记下', '记住', '记一记', '记一笔', '备忘录',
  '开始记录', '记录一下', '帮我记录', '帮我记一下', '帮我记',
  '即使', // 音近：vosk 常把"记事"识别成"即使"
  '计时', // 音近变体
  '既是', // 音近：实测"记事"最常被识别成"既是"
]

function isNoteTrigger(text: string): boolean {
  return NOTE_TRIGGER_KEYWORDS.some((kw) => text.includes(kw))
}

/** 自听检测：识别结果与刚播报的 TTS 内容高度相似 → 判定为捕获到自己的声音，应丢弃 */
function isSelfEcho(newText: string, spokenText: string): boolean {
  if (!spokenText) return false
  const norm = (s: string) => s.replace(/[\s，。！？、,.!?；：“”‘’"'()（）]/g, '')
  const a = norm(newText)
  const b = norm(spokenText)
  if (!a || !b) return false
  if (a.length >= 4 && b.includes(a)) return true
  if (b.length >= 4 && a.includes(b)) return true
  // 字符集合重合度（防长文本截断造成的部分匹配）
  const setA = new Set(a)
  const setB = new Set(b)
  let common = 0
  setA.forEach((c) => { if (setB.has(c)) common++ })
  return a.length >= 4 && common / Math.min(setA.size, setB.size) > 0.7
}

/* ═══════════ 会话结束指令 ═══════════ */

/** 说"结束/退出/再见"等 → 退出连续对话循环 */
const SESSION_END_KEYWORDS = ['结束', '退出', '再见', '拜拜', '不聊了', '退下']

function isSessionEnd(text: string): boolean {
  return SESSION_END_KEYWORDS.some((kw) => text.includes(kw))
}

/* ═══════════ 组件 ═══════════ */

type Status = 'idle' | 'listening' | 'processing' | 'speaking'

export default function GlassBubble({ onOpenSettings }: { onOpenSettings: () => void }): JSX.Element {
  const { volumeRef, start: micStart, stop: micStop } = useMicrophone()
  const { recognize } = useVoskRecognition()
  const { config, isConfigured } = useAIConfig()
  const pillRadius = H / 2
  const abortRef = useRef(false)
  /** 连续会话激活：按一次 Ctrl+T 后，回答完不进入休眠，接着听下一句 */
  const sessionActiveRef = useRef(false)
  /** 记录模式：用户下了"记事"指令后，下一句说的话保存为记事 */
  const noteModeRef = useRef(false)
  /** 最近一次播报的文本（用于自听检测：防止 Seeree 听到自己的 TTS 形成循环） */
  const lastSpokenRef = useRef('')

  const [status, setStatus] = useState<Status>('idle')
  const [statusText, setStatusText] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  // Ctrl+T 触发说话：按下时玻璃球亮度提升 1.5%
  const [keyHeld, setKeyHeld] = useState(false)

  /* 朗读字幕：全文 + 已读字符数 */
  const [speechText, setSpeechText] = useState<string | null>(null)
  const [readIndex, setReadIndex] = useState(0)
  const subtitleWrapRef = useRef<HTMLDivElement>(null)
  const subtitleCursorRef = useRef<HTMLSpanElement>(null)

  // 朗读进度变化时，滚动字幕使当前字符始终可见
  useEffect(() => {
    const wrap = subtitleWrapRef.current
    const cur = subtitleCursorRef.current
    if (!wrap || !cur) return
    const wrapRect = wrap.getBoundingClientRect()
    const curRect = cur.getBoundingClientRect()
    if (curRect.top < wrapRect.top) wrap.scrollTop -= wrapRect.top - curRect.top
    else if (curRect.bottom > wrapRect.bottom) wrap.scrollTop += curRect.bottom - wrapRect.bottom
  }, [readIndex, speechText])

  /* ─── 主流程（连续会话：听 → 处理 → 回答完接着听） ─── */
  const handleToggle = useCallback(async () => {
    // AI 响应中（思考/播报）→ 锁定，禁止再次输入/取消，防止打断回答
    if (status === 'processing' || status === 'speaking') {
      return
    }

    // 聆听中 → 点击取消，退出连续会话
    if (status === 'listening') {
      abortRef.current = true
      sessionActiveRef.current = false
      noteModeRef.current = false
      lastSpokenRef.current = ''
      micStop()
      window.speechSynthesis.cancel()
      window.electronAPI?.abortChat?.()
      setStatus('idle')
      setStatusText('')
      setErrorMsg(null)
      setSpeechText(null)
      setReadIndex(0)
      return
    }

    // idle → 进入连续会话
    abortRef.current = false
    sessionActiveRef.current = true
    noteModeRef.current = false
    lastSpokenRef.current = ''
    setErrorMsg(null)
    setStatusText('')

    while (sessionActiveRef.current && !abortRef.current) {
      // ── ① 聆听：优先本地离线识别，硬错误时回退 Web Speech ──
      setStatus('listening')
      setStatusText('')

      // 复用同一条麦克风流驱动音量，避免 vosk 与音量分析各开一条流导致丝带不动
      let micStream: MediaStream | undefined
      try {
        micStream = await micStart()
      } catch (err: any) {
        sessionActiveRef.current = false
        setStatus('idle')
        setErrorMsg(`麦克风不可用: ${err?.message || String(err)}`)
        setTimeout(() => setErrorMsg(null), 4000)
        return
      }

      let result = await recognize(12000, (partial) => {
        // 说话过程中实时回显识别中的文字，避免"等很久才出字"
        setStatusText(`你: "${partial}"`)
      }, micStream)
      if (abortRef.current || !sessionActiveRef.current) { micStop(); break }
      const hardError = result.error && !result.error.startsWith('未检测到') && !result.error.startsWith('超时')
      if (!result.text && hardError) {
        const fallback = await listenForSpeech(10000)
        if (abortRef.current || !sessionActiveRef.current) { micStop(); break }
        if (fallback.text) result = { text: fallback.text }
        else if (fallback.error) result = { ...result, error: fallback.error }
      }
      micStop()

      if (abortRef.current || !sessionActiveRef.current) break

      // 未识别到语音 → 短暂提示后继续听
      if (!result.text) {
        setErrorMsg(result.error || '未检测到语音')
        setTimeout(() => setErrorMsg(null), 1500)
        setStatusText('')
        continue
      }

      const text = result.text

      // 自听防护：若识别内容与刚播报的 TTS 高度相似，判定为捕获到自己的声音，丢弃后继续听
      if (lastSpokenRef.current && isSelfEcho(text, lastSpokenRef.current)) {
        lastSpokenRef.current = ''
        setStatusText('')
        continue
      }

      setStatusText(`你: "${text}"`)

      // ── ② 结束指令：说"结束"等 → 播报再见并退出连续会话 ──
      if (isSessionEnd(text)) {
        const byeText = '好的，再见'
        lastSpokenRef.current = byeText
        setSpeechText(byeText)
        setReadIndex(0)
        setStatus('speaking')
        await speakText(byeText)
        setReadIndex(byeText.length)
        await new Promise((r) => setTimeout(r, 1200))
        setSpeechText(null)
        setReadIndex(0)
        sessionActiveRef.current = false
        break
      }

      // ── ③ 记录模式：上一轮下了"记事"指令，这一句是记录内容 ──
      if (noteModeRef.current) {
        noteModeRef.current = false
        let noteRes: { ok: boolean; path?: string; message?: string } | undefined
        try {
          noteRes = await window.electronAPI?.saveNote(text)
        } catch (err: any) {
          noteRes = { ok: false, message: err?.message || '记事保存失败' }
        }
        if (abortRef.current || !sessionActiveRef.current) break
        if (!noteRes?.ok) {
          setErrorMsg(noteRes?.message || '记事保存失败')
          setTimeout(() => setErrorMsg(null), 3000)
          continue
        }
        // 成功：播报确认语，字幕显示被记录的话
        const confirmText = '已记录到记事本'
        lastSpokenRef.current = confirmText
        setSpeechText(text)
        setReadIndex(0)
        setStatus('speaking')
        await speakText(confirmText, (i) => setReadIndex(Math.round((i / confirmText.length) * text.length)))
        setReadIndex(text.length)
        await new Promise((r) => setTimeout(r, 1500))
        if (abortRef.current || !sessionActiveRef.current) break
        setSpeechText(null)
        setReadIndex(0)
        continue // 接着听下一句
      }

      // ── ④ 记事指令：提示"开始记录"，下一句作为记录内容 ──
      if (isNoteTrigger(text)) {
        noteModeRef.current = true
        lastSpokenRef.current = '开始记录'
        setSpeechText('开始记录')
        setReadIndex(0)
        setStatus('speaking')
        await speakText('开始记录')
        setReadIndex(4)
        await new Promise((r) => setTimeout(r, 800))
        if (abortRef.current || !sessionActiveRef.current) break
        setSpeechText(null)
        setReadIndex(0)
        continue // 接着听下一句作为记录内容
      }

      // ── ⑤ 未配置 AI → 回声测试模式（仅体验语音检测） ──
      if (!isConfigured) {
        const echo = text.length > 50 ? text.slice(0, 50) + '…' : text
        lastSpokenRef.current = echo
        setStatusText(`已识别: ${echo}`)
        setStatus('speaking')
        await speakText(text)
        if (abortRef.current || !sessionActiveRef.current) break
        continue // 接着听下一句
      }

      // ── ⑥ 思考 / 回答 ──
      setStatus('processing')
      setStatusText('') // 清掉"你: xxx"，让 label 显示"正在回答"

      try {
        const reply = await window.electronAPI!.chatCompletion({
          provider: config.provider,
          apiKey: config.apiKey,
          model: config.model,
          baseUrl: config.baseUrl,
          messages: [
            {
              role: 'system',
              content: /你好|您好|hi|hello|哈喽|hey/i.test(text)
                ? '你是 Seeree 桌面语音助手，由 Ricky 制作。请用中文简洁实用地回答用户问题。当用户向你问好或询问你是谁时，可以简短地介绍自己是 Seeree 语音助手。不要使用任何表情符号、emoji、颜文字或特殊图形符号。'
                : '你是 Seeree 桌面语音助手，由 Ricky 制作。请用中文简洁实用地回答用户问题。不要在回答中自我介绍、提及你的名字或开发者。不要使用任何表情符号、emoji、颜文字或特殊图形符号。',
            },
            { role: 'user', content: text },
          ],
        })

        if (abortRef.current || !sessionActiveRef.current) break
        if (!reply) {
          setErrorMsg('AI 未返回内容')
          setTimeout(() => setErrorMsg(null), 3000)
          continue
        }

        // 播报（字幕随朗读滚动）
        const clean = stripEmoji(reply)
        if (!clean) {
          setErrorMsg('AI 返回内容为空')
          setTimeout(() => setErrorMsg(null), 3000)
          continue
        }
        lastSpokenRef.current = clean
        setSpeechText(clean)
        setReadIndex(0)
        setStatus('speaking')
        await speakText(clean, (i) => setReadIndex(i))

        // 读完：字幕停留片刻再收起
        setReadIndex(clean.length)
        await new Promise((r) => setTimeout(r, 2500))
        if (abortRef.current || !sessionActiveRef.current) break
        // 等待 TTS 完全停止再重新聆听，避免捕获播报尾音
        while (window.speechSynthesis.speaking && sessionActiveRef.current && !abortRef.current) {
          await new Promise((r) => setTimeout(r, 150))
        }
        setSpeechText(null)
        setReadIndex(0)

      } catch (err: any) {
        // 用户主动取消导致的 AbortError → 静默，不弹错误
        if (abortRef.current || /abort/i.test(err?.message || '')) break
        setErrorMsg(`调用失败: ${err?.message || String(err)}`)
        setStatusText('')
        setSpeechText(null)
        setReadIndex(0)
        setTimeout(() => setErrorMsg(null), 3000)
      }

      // 回答完 → 循环接着听（不进入休眠）
    }

    // 会话结束（被取消）→ 回到待机
    setStatus('idle')
    setStatusText('')
    setSpeechText(null)
    setReadIndex(0)
  }, [status, config, isConfigured, micStart, micStop])



  /* ─── 键盘快捷键 ─── */
  // 取消/结束当前会话（Esc 触发）
  const cancelSession = useCallback(() => {
    sessionActiveRef.current = false
    noteModeRef.current = false
    lastSpokenRef.current = ''
    window.speechSynthesis.cancel()
    micStop()
    window.electronAPI?.abortChat?.()
    setStatus('idle')
    setStatusText('')
    setErrorMsg(null)
    setSpeechText(null)
    setReadIndex(0)
  }, [micStop])

  useEffect(() => {
    // 是否在输入框内（Ctrl+T 不干扰打字）
    const inField = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')

    const onKeyDown = (e: KeyboardEvent) => {
      if (inField(e.target)) return
      if (e.key === 'Escape') {
        cancelSession()
        return
      }
      // Ctrl+T 触发说话（忽略按键自动重复）
      if (e.ctrlKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault()
        if (e.repeat) return
        setKeyHeld(true)
        if (status === 'idle') {
          handleToggle()
        } else if (status === 'listening') {
          // 已在聆听：继续说话，不做额外动作
        } else {
          // processing/speaking 中：保持锁定，不打断
        }
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      // 松开 Ctrl 或 T：仅复位亮度，不取消会话（取消只能通过点击）
      if (e.key === 'Control' || e.key === 't' || e.key === 'T') {
        setKeyHeld(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      setKeyHeld(false)
    }
  }, [cancelSession, status, handleToggle])

  /* ─── 状态标签内容 ─── */
  const labelText = errorMsg
    || statusText
    || (status === 'listening' ? '聆听中...'
    : status === 'processing' ? '正在回答...'
    : status === 'speaking' ? '播报中...'
    : '按 Ctrl+T 或点击开始')

  const labelColor = errorMsg
    ? 'rgba(255,100,100,0.75)'
    : status === 'listening' ? 'rgba(99,200,255,0.55)'
    : status === 'processing' ? 'rgba(255,200,80,0.55)'
    : status === 'speaking' ? 'rgba(100,255,180,0.55)'
    : 'rgba(255,255,255,0.2)'

  return (
    <div
      style={{
        width: 360,
        height: 216,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        background: 'transparent',
        boxSizing: 'border-box',
        WebkitAppRegion: 'drag' as any,
      }}>
        {/* ═══════════ 泡泡主体 ═══════════ */}
          <div
            onClick={handleToggle}
            title={
              status === 'idle'
                ? '按 Ctrl+T 或点击开始语音对话 (Esc 取消)'
                : '点击取消'
            }
            style={{
              width: W, height: H,
              borderRadius: pillRadius,
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              overflow: 'hidden',
              WebkitAppRegion: 'no-drag' as any,
              background:
                status !== 'idle'
                  ? 'rgba(20,10,40,0.5)'
                  : 'rgba(20,10,40,0.35)',
              backdropFilter: `blur(24px) brightness(${keyHeld ? 0.964 : 0.95})`,
              WebkitBackdropFilter: `blur(24px) brightness(${keyHeld ? 0.964 : 0.95})`,
              zIndex: 1,
              boxShadow: [
                'inset 0 1px 0 rgba(255,255,255,0.08)',
                'inset 0 -1px 0 rgba(0,0,0,0.15)',
                '0 4px 30px rgba(0,0,0,0.3)',
              ].join(', '),
              border: '1px solid rgba(255,255,255,0.1)',
              transition: 'background 0.3s ease, backdrop-filter 0.15s ease',
            }}
          >
            {/* 内表面径向渐变 */}
            <div style={{
              position: 'absolute', inset: 0,
              borderRadius: pillRadius,
              background: `radial-gradient(ellipse 65% 42% at 36% 30%,
                rgba(255,255,255,0.1) 0%, transparent 50%)`,
              pointerEvents: 'none',
            }} />

            {/* SiriWave */}
            <div style={{ position: 'relative', zIndex: 2 }}>
              <SiriWave
                volumeRef={volumeRef}
                listening={status !== 'idle'}
                speaking={status === 'speaking'}
                width={W}
                height={H}
              />
            </div>

            {/* ═══════ 表面反射 ═══════ */}

            {/* 顶部高光弧 */}
            <div style={{
              position: 'absolute', top: 0, left: 10, right: 10, height: '40%',
              borderRadius: `${pillRadius - 4}px ${pillRadius - 4}px 0 0`,
              background: `linear-gradient(180deg,
                rgba(255,255,255,0.18) 0%,
                rgba(255,255,255,0.05) 35%,
                transparent 100%)`,
              pointerEvents: 'none', zIndex: 3,
            }} />

            {/* 高光斑 */}
            <div style={{
              position: 'absolute', top: '10%', left: '20%',
              width: 44, height: 14,
              borderRadius: '50%',
              background: `radial-gradient(ellipse at 50% 50%,
                rgba(255,255,255,0.14) 0%, transparent 70%)`,
              filter: 'blur(3px)',
              pointerEvents: 'none', zIndex: 3,
            }} />

            {/* 底部折射暗晕 */}
            <div style={{
              position: 'absolute', bottom: 0, left: 6, right: 6, height: '32%',
              borderRadius: `0 0 ${pillRadius - 4}px ${pillRadius - 4}px`,
              background: `linear-gradient(0deg,
                rgba(10,5,30,0.15) 0%, transparent 100%)`,
              pointerEvents: 'none', zIndex: 2,
            }} />

            {/* 底部信息区：朗读字幕 或 状态标签 */}
            {speechText !== null && status === 'speaking' ? (
              <div
                ref={subtitleWrapRef}
                style={{
                  position: 'absolute', bottom: 12, left: 0, right: 0,
                  padding: '0 22px',
                  zIndex: 5, pointerEvents: 'none',
                  maxHeight: 66,
                  overflow: 'hidden',
                  fontSize: 12,
                  lineHeight: 1.55,
                  textAlign: 'left',
                }}
              >
                <span style={{ color: 'rgba(255,255,255,0.95)' }}>
                  {speechText.slice(0, readIndex)}
                </span>
                <span
                  ref={subtitleCursorRef}
                  style={{
                    display: 'inline-block',
                    color: '#7CFFB2',
                    textShadow: '0 0 8px rgba(124,255,178,0.6)',
                  }}
                >
                  {speechText.slice(readIndex, readIndex + 1)}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.32)' }}>
                  {speechText.slice(readIndex + 1)}
                </span>
              </div>
            ) : (
              <div style={{
                position: 'absolute', bottom: 12, left: 0, right: 0,
                textAlign: 'center',
                zIndex: 5, pointerEvents: 'none',
                padding: '0 16px',
              }}>
                <span style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: labelColor,
                  letterSpacing: '0.04em',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap' as const,
                  display: 'block',
                }}>
                  {labelText}
                </span>
              </div>
            )}
          </div>

        {/* ═══════════ ⚙ 设置按钮 ═══════════ */}
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onOpenSettings()
          }}
          title="AI 设置"
          style={gearBtnStyle}
        >
          <GearIcon />
        </button>

        {/* ═══════════ AI 未配置提示 ═══════════ */}
        {!isConfigured && status === 'idle' && (
          <div style={keyHintStyle}>未配置 AI · 点击可测试语音</div>
        )}
      </div>
  )
}

/* ═══════════ 子组件 ═══════════ */

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

/* ═══════════ 样式 ═══════════ */

const gearBtnStyle: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  width: 30,
  height: 30,
  borderRadius: 8,
  border: 'none',
  background: 'rgba(255,255,255,0.08)',
  color: 'rgba(255,255,255,0.55)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10,
  transition: 'all 0.18s ease',
  WebkitAppRegion: 'no-drag' as any,
}

const keyHintStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 8,
  fontSize: 10,
  color: 'rgba(255,200,80,0.45)',
  pointerEvents: 'none',
  zIndex: 0,
}
