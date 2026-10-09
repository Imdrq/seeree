import { useState, useCallback, useEffect, useRef } from 'react'
import SiriWave from './SiriWave'
import useWhisperRecognition from './useWhisperRecognition'
import { useMicrophone } from './useMicrophone'
import { useAIConfig, THEME_COLORS } from '../hooks/useAIConfig'

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
    if (!text) { resolve(); return }

    // Chrome 有已知 bug：长 utterance 约 15s 后被截断且不触发 onend，
    // 因此按句切块播报，并给每块加兜底超时。
    const chunks = splitForSpeech(text)
    let idx = 0
    let cancelled = false

    const done = () => {
      if (cancelled) return
      cancelled = true
      onProgress?.(text.length)
      resolve()
    }

    const speakNext = () => {
      if (cancelled) return
      if (idx >= chunks.length) { done(); return }
      const chunk = chunks[idx]
      const chunkStart = chunks.slice(0, idx).reduce((n, c) => n + c.length, 0)
      const utterance = new SpeechSynthesisUtterance(chunk)
      utterance.lang = 'zh-CN'
      utterance.rate = 1.05
      utterance.pitch = 1.0

      let settled = false
      let boundarySeen = false
      const startAt = Date.now()

      // 每块兜底超时：按语速估算 + 8s 余量，防止 onend 不触发导致会话锁死
      const estMs = 600 + (chunk.length * 170) / utterance.rate
      const hardTimer = setTimeout(() => {
        if (settled) return
        settled = true
        idx++
        speakNext()
      }, estMs + 8000)

      utterance.onboundary = (e: any) => {
        if (typeof e?.charIndex === 'number') {
          boundarySeen = true
          onProgress?.(chunkStart + e.charIndex)
        }
      }
      const estTimer = setInterval(() => {
        if (boundarySeen || settled) return
        const p = Math.min(1, (Date.now() - startAt) / estMs)
        onProgress?.(chunkStart + Math.round(chunk.length * p))
      }, 120)

      utterance.onend = () => {
        if (settled) return
        settled = true
        clearTimeout(hardTimer)
        clearInterval(estTimer)
        onProgress?.(chunkStart + chunk.length)
        idx++
        speakNext()
      }
      utterance.onerror = () => {
        if (settled) return
        settled = true
        clearTimeout(hardTimer)
        clearInterval(estTimer)
        // 出错也继续下一块，避免整体卡死
        idx++
        speakNext()
      }

      try {
        window.speechSynthesis.speak(utterance)
      } catch {
        if (settled) return
        settled = true
        clearTimeout(hardTimer)
        clearInterval(estTimer)
        idx++
        speakNext()
      }
    }

    speakNext()
  })
}

/** 按句切块，保证每块长度可控，规避 Chrome TTS 长文本截断 bug */
function splitForSpeech(text: string, maxLen = 80): string[] {
  if (text.length <= maxLen) return [text]
  const sentences = text.split(/(?<=[。！？!?；;\n])/).filter((s) => s.trim())
  const chunks: string[] = []
  let buf = ''
  for (const s of sentences) {
    if (buf && buf.length + s.length > maxLen) {
      chunks.push(buf)
      buf = s
    } else {
      buf += s
    }
    // 单句超长时硬切
    while (buf.length > maxLen) {
      chunks.push(buf.slice(0, maxLen))
      buf = buf.slice(maxLen)
    }
  }
  if (buf.trim()) chunks.push(buf)
  return chunks.length > 0 ? chunks : [text]
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
  '记一下', '记下', '记一记', '记一笔', '备忘录',
  '开始记录', '记录一下', '帮我记录', '帮我记一下', '帮我记',
]
/**
 * 音近容错词：vosk 常把"记事"识别成这些。
 * 仅在极短独立指令（≤3 字）时生效，避免"开始计时""即使今天下雨"等正常语句误触发。
 */
const NOTE_TRIGGER_LOOSE_KEYWORDS = ['即使', '既是', '计时']

/**
 * 计时/闹钟类意图：与"记事"音近，但语义是计时。
 * 命中时绝不进记事模式，即使句中含音近词。
 * 单独说"计时"（无上下文）视为可能的"记事"误识别，放行给记事。
 */
function isTimerCommand(text: string): boolean {
  // "计时" 与动词/时长搭配 → 明确计时意图
  if (/计时/.test(text) && /开始|停止|暂停|继续|结束|帮我|给我|倒|器|分钟|秒钟|小时|[一二三四五六七八九十百千\d]/.test(text)) {
    return true
  }
  return /倒计时|计时器|秒表|闹钟|定时/.test(text)
}

/** 记事指令检测 */
function isNoteTrigger(text: string): boolean {
  const t = text.trim()
  // 精确指令词直接触发（优先级最高）
  if (NOTE_TRIGGER_KEYWORDS.some((kw) => t.includes(kw))) return true
  // 音近容错：极短独立指令才认，排除计时类意图
  if (t.length <= 3 && !isTimerCommand(t) && NOTE_TRIGGER_LOOSE_KEYWORDS.some((kw) => t.includes(kw))) {
    return true
  }
  return false
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

/* ═══════════ 联网搜索意图检测 ═══════════ */

const SEARCH_TRIGGERS = [
  '搜索', '搜一下', '查一下', '查查', '帮我搜', '帮我查',
  '最新', '新闻', '今天', '天气', '股价', '比赛', '实时',
]

function needsSearch(text: string): boolean {
  return SEARCH_TRIGGERS.some((kw) => text.includes(kw))
}

/** 构建系统提示词（注入当前时间） */
function buildSystemPrompt(text: string): string {
  const now = new Date()
  const timeStr = now.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'long',
  })
  const timeContext = `当前时间：${timeStr}。`
  const greet = /你好|您好|hi|hello|哈喽|hey/i.test(text)
  const base = greet
    ? `你是 Seeree 桌面语音助手，由 Ricky 制作。${timeContext}请用中文简洁实用地回答用户问题。当用户向你问好或询问你是谁时，可以简短地介绍自己是 Seeree 语音助手。不要使用任何表情符号、emoji、颜文字或特殊图形符号。`
    : `你是 Seeree 桌面语音助手，由 Ricky 制作。${timeContext}请用中文简洁实用地回答用户问题。不要在回答中自我介绍、提及你的名字或开发者。不要使用任何表情符号、emoji、颜文字或特殊图形符号。`
  return base + '重要：如果用户询问天气、新闻、股价、比赛结果、实时资讯等需要联网获取的信息，你必须直接根据搜索结果回答，绝对不要反问用户"要不要搜索"、"需要我帮你查吗"或类似问题。搜索已经自动完成，你只需根据提供的搜索结果给出答案。如果搜索结果中没有相关信息，直接说明没有查到即可。'
}

/* ═══════════ 会话结束指令 ═══════════ */

/** 说"结束/退出/再见"等 → 退出连续对话循环 */
const SESSION_END_KEYWORDS = ['再见', '拜拜', '不聊了', '退下']
/** 较常见的词，仅在极短指令中才视为结束指令，避免"结束这个任务"等误触发 */
const SESSION_END_LOOSE_KEYWORDS = ['结束', '退出']

/**
 * 会话结束指令检测：
 * - "再见/拜拜/不聊了/退下" 语义明确，任意位置出现即可
 * - "结束/退出" 太常见，仅在极短独立指令（≤4 字）中生效
 */
function isSessionEnd(text: string): boolean {
  const t = text.trim()
  if (SESSION_END_KEYWORDS.some((kw) => t.includes(kw))) return true
  if (t.length <= 4 && SESSION_END_LOOSE_KEYWORDS.some((kw) => t.includes(kw))) return true
  return false
}

/** LLM 同音字纠错：根据上下文修正语音识别中的同音字错误 */
async function correctHomophones(
  rawText: string,
  chatFn: typeof window.electronAPI.chatCompletion,
  config: { provider: string; apiKey: string; model: string; baseUrl: string }
): Promise<string> {
  // 短文本（≤4字）不需要纠错，避免浪费时间
  if (rawText.length <= 4) return rawText
  try {
    const corrected = await chatFn({
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl,
      messages: [
        {
          role: 'system',
          content: '你是语音识别纠错助手。用户提供的文本是语音转文字的结果，可能存在同音字错误。请根据上下文和语义修正错误的同音字，保持原意不变。只输出修正后的文本，不要任何解释。',
        },
        { role: 'user', content: rawText },
      ],
    })
    const clean = corrected?.trim() || ''
    // 纠错结果太离谱时丢弃，用原文
    if (clean && clean.length >= rawText.length * 0.5 && clean.length <= rawText.length * 2) {
      return clean
    }
    return rawText
  } catch {
    return rawText // 纠错失败不影响主流程
  }
}

/* ═══════════ 组件 ═══════════ */

type Status = 'idle' | 'editing' | 'listening' | 'processing' | 'speaking'

// 形变参数
const IDLE_W = 320, IDLE_H = 180, IDLE_R = 90
const EDIT_W = 420, EDIT_H = 220, EDIT_R = 24
const MORPH_EASE = 'cubic-bezier(0.34, 1.56, 0.64, 1)' // spring overshoot

export default function GlassBubble({ onOpenSettings }: { onOpenSettings: () => void }): JSX.Element {
  const { volumeRef, start: micStart, stop: micStop } = useMicrophone()
  const { recognize } = useWhisperRecognition()
  const { config, isConfigured, searchConfig, inputHotkey, theme } = useAIConfig()
  const colors = THEME_COLORS[theme]
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
  // ── Liquid Glass 形变输入面板 ──
  const [inputValue, setInputValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isEditing = status === 'editing'
  // Ctrl+T 触发说话：按下时玻璃球亮度提升 1.5%
  const [keyHeld, setKeyHeld] = useState(false)
  /** 会话循环正在运行（同步互斥锁，防止双击/快捷键并发触发双会话） */
  const runningRef = useRef(false)
  /** 会话空闲计时（毫秒），超过自动退出 */
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 思考/播报中是否允许打断（可在设置中修改） */
  const [lockDuringResponse, setLockDuringResponse] = useState(() => {
    try { return localStorage.getItem('seeree-lock-response') !== '0' } catch { return true }
  })

  /** 重置空闲计时器（仅聆听阶段启动，思考/播报时调用 clearIdleTimer 暂停） */
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(() => {
      // 仅在聆听中才超时退出，思考/播报不打断
      if (runningRef.current && sessionActiveRef.current && status === 'listening') {
        abortRef.current = true
        sessionActiveRef.current = false
        runningRef.current = false
        micStop()
        window.speechSynthesis.cancel()
        window.electronAPI?.abortChat?.()
        setStatus('idle')
        setStatusText('')
        setSpeechText(null)
        setReadIndex(0)
      }
    }, 30000)
  }, [micStop, status])

  /** 暂停空闲计时（思考/播报期间不计时，避免 AI 响应慢被误杀） */
  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
  }, [])

  /* ─── Liquid Glass 输入面板 ─── */

  /** 展开/收起输入面板 */
  const toggleInputPanel = useCallback(() => {
    if (status === 'editing') {
      // 再按一次快捷键 → 退出输入模式
      setInputValue('')
      setStatus('idle')
      setStatusText('')
      return
    }
    if (status === 'processing' || status === 'speaking') {
      if (lockDuringResponse) return
      abortRef.current = true
      sessionActiveRef.current = false
      micStop()
      window.speechSynthesis.cancel()
      window.electronAPI?.abortChat?.()
    }
    if (status === 'listening') {
      abortRef.current = true
      sessionActiveRef.current = false
      micStop()
    }
    setStatus('editing')
    setStatusText('')
    setErrorMsg(null)
    setInputValue('')
    // 视觉反馈：短暂提亮
    setKeyHeld(true)
    setTimeout(() => setKeyHeld(false), 300)
    // 自动 focus
    setTimeout(() => textareaRef.current?.focus(), 80)
  }, [status, lockDuringResponse, micStop])

  /** 提交文本 → 走现有 chat 管线 */
  const handleSubmitText = useCallback(async () => {
    const text = inputValue.trim()
    if (!text) return
    // 收起面板
    setInputValue('')
    setStatus('idle')
    setStatusText('')

    // 复用 handleToggle 的 chat 逻辑：直接启动语音 session 循环并注入文本
    // 为了 MVP 简洁，这里直接走一轮 chat
    if (!isConfigured) {
      setErrorMsg('未配置 AI')
      setTimeout(() => setErrorMsg(null), 3000)
      return
    }
    setStatus('processing')
    try {
      // 搜索
      let searchContext = ''
      const searchReady = searchConfig.enabled && (
        searchConfig.provider === 'searxng'
          ? !!searchConfig.instanceUrl
          : !!searchConfig.apiKey
      )
      if (needsSearch(text) && searchReady) {
        try {
          setStatusText('正在搜索...')
          const sr = await window.electronAPI!.webSearch({
            query: text,
            provider: searchConfig.provider,
            apiKey: searchConfig.apiKey,
            instanceUrl: searchConfig.instanceUrl,
            maxResults: 5,
            timeout: searchConfig.timeout,
          })
          if (sr.ok && sr.results.length > 0) {
            searchContext = sr.results.map((r, i) =>
              `[${i + 1}] ${r.title} | ${r.source || ''} | ${r.snippet}`
            ).join('\n')
          }
        } catch { /* 搜索失败不阻断 */ }
      }

      setStatusText('')
      const systemPrompt = buildSystemPrompt(text)

      const userMessage = searchContext
        ? `以下是已自动完成的网络搜索结果，请直接据此回答用户问题并标注来源编号，不要反问是否需要搜索：\n${searchContext}\n\n用户问题：${text}`
        : text

      const reply = await window.electronAPI!.chatCompletion({
        provider: config.provider,
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      })

      if (!reply) {
        setErrorMsg('AI 未返回内容')
        setTimeout(() => setErrorMsg(null), 3000)
        setStatus('idle')
        return
      }

      const clean = stripEmoji(reply)
      if (!clean) {
        setErrorMsg('AI 返回内容为空')
        setTimeout(() => setErrorMsg(null), 3000)
        setStatus('idle')
        return
      }

      lastSpokenRef.current = clean
      setSpeechText(clean)
      setReadIndex(0)
      setStatus('speaking')
      await speakText(clean, (i) => setReadIndex(i))
      setSpeechText(null)
      setReadIndex(0)
    } catch (err: any) {
      setErrorMsg(err?.message || '回答失败')
      setTimeout(() => setErrorMsg(null), 3000)
    }
    setStatus('idle')
  }, [inputValue, isConfigured, searchConfig, config])

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

  // 快捷键触发输入面板（主进程 globalShortcut → IPC）
  useEffect(() => {
    const unsub = window.electronAPI?.onToggleInputPanel?.(() => {
      toggleInputPanel()
    })
    return () => { unsub?.() }
  }, [toggleInputPanel])

  // 退出输入模式时 blur textarea，防止残留键盘输入
  useEffect(() => {
    if (!isEditing) {
      textareaRef.current?.blur()
    }
  }, [isEditing])

  /* ─── 主流程（连续会话：听 → 处理 → 回答完接着听） ─── */
  const handleToggle = useCallback(async () => {
    // AI 响应中（思考/播报）→ 根据设置决定是否可打断
    if (status === 'processing' || status === 'speaking') {
      if (lockDuringResponse) return // 锁定：不可打断
      // 可打断：取消当前回答
      abortRef.current = true
      sessionActiveRef.current = false
      noteModeRef.current = false
      lastSpokenRef.current = ''
      window.speechSynthesis.cancel()
      window.electronAPI?.abortChat?.()
      runningRef.current = false
      clearIdleTimer()
      setStatus('idle')
      setStatusText('')
      setErrorMsg(null)
      setSpeechText(null)
      setReadIndex(0)
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
      runningRef.current = false
      setStatus('idle')
      setStatusText('')
      setErrorMsg(null)
      setSpeechText(null)
      setReadIndex(0)
      return
    }

    // 同步互斥：防止双击 / Ctrl+T+点击 并发进入双会话
    if (runningRef.current) return
    runningRef.current = true

    // idle → 进入连续会话
    abortRef.current = false
    sessionActiveRef.current = true
    noteModeRef.current = false
    lastSpokenRef.current = ''
    setErrorMsg(null)
    setStatusText('')

    try {
    while (sessionActiveRef.current && !abortRef.current) {
      // ── ① 聆听：优先本地离线识别，硬错误时回退 Web Speech ──
      setStatus('listening')
      setStatusText('')
      resetIdleTimer()

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

      let result = await recognize(15000, (status) => {
        setStatusText(status)
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

      let text = result.text
      resetIdleTimer() // 有语音活动，重置空闲计时

      // ── LLM 同音字纠错 ──
      if (isConfigured) {
        setStatusText('正在修正...')
        text = await correctHomophones(text, window.electronAPI!.chatCompletion!, config)
      }

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
        clearIdleTimer()
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
        clearIdleTimer()
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
        clearIdleTimer()
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
        clearIdleTimer()
        setStatus('speaking')
        await speakText(text)
        if (abortRef.current || !sessionActiveRef.current) break
        continue // 接着听下一句
      }

      // ── ⑥ 思考 / 回答 ──
      clearIdleTimer() // 思考/播报期间不计空闲
      setStatus('processing')
      setStatusText('') // 清掉"你: xxx"，让 label 显示"正在回答"

      // 联网搜索：需要时先搜再答
      let searchContext = ''
      const searchReady = searchConfig.enabled && (
        searchConfig.provider === 'searxng'
          ? !!searchConfig.instanceUrl
          : !!searchConfig.apiKey
      )
      if (needsSearch(text) && searchReady) {
        try {
          setStatusText('正在搜索...')
          const sr = await window.electronAPI!.webSearch({
            query: text,
            provider: searchConfig.provider,
            apiKey: searchConfig.apiKey,
            instanceUrl: searchConfig.instanceUrl,
            maxResults: 5,
            timeout: searchConfig.timeout,
          })
          if (sr.ok && sr.results.length > 0) {
            searchContext = sr.results.map((r, i) =>
              `[${i + 1}] ${r.title} | ${r.source || ''} | ${r.snippet}`
            ).join('\n')
          } else if (!sr.ok && sr.message) {
            // 搜索失败不阻断，降级为直接回答
            console.warn('[search]', sr.message)
          }
        } catch (err: any) {
          console.warn('[search] error:', err?.message)
        }
        if (abortRef.current || !sessionActiveRef.current) break
        setStatusText('')
      }

      try {
        const systemPrompt = buildSystemPrompt(text)

        const userMessage = searchContext
          ? `以下是已自动完成的网络搜索结果，请直接据此回答用户问题并标注来源编号，不要反问是否需要搜索：\n${searchContext}\n\n用户问题：${text}`
          : text

        const reply = await window.electronAPI!.chatCompletion({
          provider: config.provider,
          apiKey: config.apiKey,
          model: config.model,
          baseUrl: config.baseUrl,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
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
        clearIdleTimer()
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
    } finally {
      runningRef.current = false
    }

    // 会话结束（被取消）→ 回到待机
    setStatus('idle')
    setStatusText('')
    setSpeechText(null)
    setReadIndex(0)
  }, [status, config, isConfigured, searchConfig, lockDuringResponse, micStart, micStop, resetIdleTimer, clearIdleTimer])

  // 语音输入快捷键（须在 handleToggle 定义之后，否则依赖数组触发 TDZ 崩溃）
  useEffect(() => {
    const unsub = window.electronAPI?.onToggleVoiceInput?.(() => {
      handleToggle()
    })
    return () => { unsub?.() }
  }, [handleToggle])

  /* ─── 键盘快捷键 ─── */
  // 取消/结束当前会话（Esc 触发）
  const cancelSession = useCallback(() => {
    abortRef.current = true
    sessionActiveRef.current = false
    noteModeRef.current = false
    lastSpokenRef.current = ''
    window.speechSynthesis.cancel()
    micStop()
    window.electronAPI?.abortChat?.()
    runningRef.current = false
    clearIdleTimer()
    setStatus('idle')
    setStatusText('')
    setErrorMsg(null)
    setSpeechText(null)
    setReadIndex(0)
    setInputValue('')
  }, [micStop, clearIdleTimer])

  // 窗口失焦 / 隐藏时自动取消会话（防止后台继续听和回答）
  // 但思考/播报中不打断（锁定模式下），只在聆听中取消
  useEffect(() => {
    const shouldCancelOnBlur = () => runningRef.current && status === 'listening'
    const onVisibility = () => {
      if (document.hidden && shouldCancelOnBlur()) {
        cancelSession()
      }
    }
    const onBlur = () => {
      if (shouldCancelOnBlur()) {
        setTimeout(() => {
          if (shouldCancelOnBlur() && !document.hasFocus()) {
            cancelSession()
          }
        }, 500)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onBlur)
    }
  }, [cancelSession, status])

  useEffect(() => {
    // 是否在输入框内（快捷键不干扰打字）
    const inField = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')

    const onKeyDown = (e: KeyboardEvent) => {
      if (inField(e.target)) {
        // 在输入框内：只处理 Escape 退出 editing
        if (e.key === 'Escape' && status === 'editing') {
          e.preventDefault()
          setInputValue('')
          setStatus('idle')
          setStatusText('')
        }
        return
      }
      if (e.key === 'Escape') {
        cancelSession()
        return
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      // 松开快捷键：仅复位亮度
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
  }, [cancelSession, status])

  /* ─── 状态标签内容 ─── */
  const labelText = errorMsg
    || statusText
    || (status === 'editing' ? '输入内容后按 Enter 发送'
    : status === 'listening' ? '聆听中...'
    : status === 'processing' ? '正在回答...'
    : status === 'speaking' ? '播报中...'
    : `按 ${inputHotkey} 或点击开始`)

  const labelColor = errorMsg
    ? 'rgba(255,100,100,0.75)'
    : status === 'editing' ? 'rgba(255,255,255,0.35)'
    : status === 'listening' ? 'rgba(99,200,255,0.55)'
    : status === 'processing' ? 'rgba(255,200,80,0.55)'
    : status === 'speaking' ? 'rgba(100,255,180,0.55)'
    : 'rgba(255,255,255,0.2)'

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        background: 'transparent',
        boxSizing: 'border-box',
        WebkitAppRegion: 'drag',
      } as any}>
        {/* ═══════════ 气泡簇：气泡 + 紧贴的设置按钮 ═══════════ */}
        <div style={{
          position: 'relative',
          width: isEditing ? EDIT_W : IDLE_W,
          height: isEditing ? EDIT_H : IDLE_H,
          flexShrink: 0,
          transition: `width 0.45s ${MORPH_EASE}, height 0.45s ${MORPH_EASE}`,
        }}>
          {/* 泡泡主体（形变容器） */}
          <div
            onClick={isEditing ? undefined : handleToggle}
            title={
              isEditing
                ? '输入内容后按 Enter 发送，Esc 取消'
                : status === 'idle'
                  ? '点击或按快捷键开始 (Esc 取消)'
                  : '点击取消'
            }
            style={{
              width: '100%',
              height: '100%',
              borderRadius: isEditing ? EDIT_R : IDLE_R,
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: isEditing ? 'flex-start' : 'center',
              cursor: isEditing ? 'text' : 'pointer',
              overflow: 'hidden',
              WebkitAppRegion: 'no-drag',
              background:
                isEditing
                  ? colors.inputBg
                  : status !== 'idle'
                    ? colors.bubbleBgActive
                    : colors.bubbleBg,
              backdropFilter: `blur(24px) brightness(${keyHeld ? 0.964 : 0.95})`,
              WebkitBackdropFilter: `blur(24px) brightness(${keyHeld ? 0.964 : 0.95})`,
              zIndex: 1,
              boxShadow: [
                'inset 0 1px 0 rgba(255,255,255,0.08)',
                'inset 0 -1px 0 rgba(0,0,0,0.15)',
                '0 4px 30px rgba(0,0,0,0.3)',
              ].join(', '),
              border: '1px solid rgba(255,255,255,0.1)',
              transition: [
                `border-radius 0.45s ${MORPH_EASE}`,
                'background 0.3s ease',
                'backdrop-filter 0.15s ease',
              ].join(', '),
            } as any}
          >
            {/* 内表面径向渐变 */}
            <div style={{
              position: 'absolute', inset: 0,
              borderRadius: isEditing ? EDIT_R : IDLE_R,
              background: `radial-gradient(ellipse 65% 42% at 36% 30%,
                rgba(255,255,255,0.1) 0%, transparent 50%)`,
              pointerEvents: 'none',
              transition: `border-radius 0.45s ${MORPH_EASE}`,
            }} />

            {/* SiriWave（editing 时隐藏） */}
            {!isEditing && (
              <div style={{ position: 'relative', zIndex: 2 }}>
                <SiriWave
                  volumeRef={volumeRef}
                  listening={status !== 'idle'}
                  speaking={status === 'speaking'}
                  width={W}
                  height={H}
                />
              </div>
            )}

            {/* ═══════ 形变输入内容层（editing） ═══════ */}
            <div style={{
              position: 'absolute', inset: 0,
              zIndex: 10,
              display: 'flex', flexDirection: 'column',
              padding: '18px 20px 14px',
              opacity: isEditing ? 1 : 0,
              visibility: isEditing ? 'visible' : 'hidden',
              pointerEvents: isEditing ? 'auto' : 'none',
              transition: `opacity 0.25s ease ${isEditing ? '80ms' : '0ms'}`,
            } as any}>
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmitText()
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setInputValue('')
                    setStatus('idle')
                    setStatusText('')
                  }
                }}
                placeholder="输入内容…"
                style={{
                  flex: 1,
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  color: '#ffffff',
                  fontSize: 15,
                  lineHeight: 1.5,
                  fontFamily: 'inherit',
                  overflowY: 'auto',
                  caretColor: '#ffffff',
                } as any}
              />
              {/* 操作栏 */}
              <div style={{
                display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
                gap: 8, paddingTop: 8, marginTop: 4,
                borderTop: '1px solid rgba(255,255,255,0.06)',
              }}>
                <button
                  onClick={() => { setInputValue(''); setStatus('idle'); setStatusText('') }}
                  style={{
                    padding: '5px 14px', borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: 12, cursor: 'pointer', outline: 'none',
                    transition: 'all 0.15s ease',
                  } as any}
                >
                  Esc
                </button>
                <button
                  onClick={handleSubmitText}
                  style={{
                    padding: '5px 18px', borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.25)',
                    background: 'rgba(255,255,255,0.15)',
                    color: '#ffffff',
                    fontSize: 12, fontWeight: 500, cursor: 'pointer', outline: 'none',
                    transition: 'all 0.15s ease',
                  } as any}
                >
                  发送 ↵
                </button>
              </div>
            </div>

            {/* ═══════ 表面反射 ═══════ */}

            {/* 顶部高光弧 */}
            <div style={{
              position: 'absolute', top: 0, left: 10, right: 10, height: '40%',
              borderRadius: `${isEditing ? EDIT_R - 4 : IDLE_R - 4}px ${isEditing ? EDIT_R - 4 : IDLE_R - 4}px 0 0`,
              background: `linear-gradient(180deg,
                rgba(255,255,255,0.18) 0%,
                rgba(255,255,255,0.05) 35%,
                transparent 100%)`,
              pointerEvents: 'none', zIndex: 3,
              transition: `border-radius 0.45s ${MORPH_EASE}`,
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
              borderRadius: `0 0 ${isEditing ? EDIT_R - 4 : IDLE_R - 4}px ${isEditing ? EDIT_R - 4 : IDLE_R - 4}px`,
              background: `linear-gradient(0deg,
                rgba(10,5,30,0.15) 0%, transparent 100%)`,
              pointerEvents: 'none', zIndex: 2,
              transition: `border-radius 0.45s ${MORPH_EASE}`,
            }} />

            {/* 底部信息区：朗读字幕 或 状态标签（editing 时隐藏） */}
            {!isEditing && (speechText !== null && status === 'speaking' ? (
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
            ))}
          </div>

          {/* ═══════════ ⚙ 设置按钮（贴在气泡右上角） ═══════════ */}
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

          {/* ═══════════ AI 未配置提示（气泡下方） ═══════════ */}
          {!isConfigured && status === 'idle' && (
            <div style={keyHintStyle}>未配置 AI · 点击可测试语音</div>
          )}
        </div>
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

const gearBtnStyle: any = {
  position: 'absolute',
  // 贴在气泡右上角外侧，随气泡形变一起移动
  top: -10,
  right: -10,
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
  WebkitAppRegion: 'no-drag',
}

const keyHintStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  right: 0,
  marginTop: 6,
  fontSize: 10,
  color: 'rgba(255,200,80,0.45)',
  textAlign: 'center',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  pointerEvents: 'none',
  zIndex: 0,
}
