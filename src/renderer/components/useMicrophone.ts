import { useRef, useEffect, useState, useCallback } from 'react'

/* ================================================================
   useMicrophone — Web Audio API 麦克风捕获
   ================================================================ */

export interface MicData {
  volumeRef: React.MutableRefObject<number>
  listening: boolean
  start: () => Promise<MediaStream>
  stop: () => void
  error: string | null
}

export function useMicrophone(): MicData {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const volumeRef = useRef(0)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef(0)
  const smoothRef = useRef(0)

  const cleanup = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {})
    }
    audioCtxRef.current = null
    analyserRef.current = null
    smoothRef.current = 0
    volumeRef.current = 0
  }, [])

  const start = useCallback(async (): Promise<MediaStream> => {
    cleanup()
    setError(null)

    try {
      // 1. 获取麦克风流（开启回声消除，防止 TTS 播报被麦克风捕获形成自听循环）
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: 44100 },
          channelCount: { ideal: 1 },
        }
      })
      streamRef.current = stream

      // 验证流有活动轨道
      const audioTracks = stream.getAudioTracks()
      if (audioTracks.length === 0) throw new Error('No audio tracks')
      console.log('[Mic] stream ready, tracks:', audioTracks.length, 'label:', audioTracks[0]?.label)

      // 2. 创建 AudioContext
      const ctx = new AudioContext({ sampleRate: 44100 })
      audioCtxRef.current = ctx
      console.log('[Mic] AudioContext state:', ctx.state)

      // 确保 resume（某些浏览器需要用户手势）
      if (ctx.state === 'suspended') {
        await ctx.resume()
        console.log('[Mic] AudioContext resumed:', ctx.state)
      }

      // 3. 创建 Analyser
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.65
      analyser.minDecibels = -80
      analyser.maxDecibels = -10
      analyserRef.current = analyser

      // 4. 连接：source → analyser（不连 destination，避免回声）
      const source = ctx.createMediaStreamSource(stream)
      source.connect(analyser)

      setListening(true)
      console.log('[Mic] listening started')

      // 5. 动画帧读取音量
      const buffer = new Float32Array(analyser.fftSize)
      const tick = () => {
        if (!analyserRef.current) return
        analyserRef.current.getFloatTimeDomainData(buffer)
        let sum = 0
        for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i]
        const rms = Math.sqrt(sum / buffer.length)
        // 线性放大后加静音闸门：环境噪声（风扇等）低于阈值 → 归零
        const linear = rms * 12
        if (linear < 0.18) {
          smoothRef.current *= 0.85
          volumeRef.current = smoothRef.current
          rafRef.current = requestAnimationFrame(tick)
          return
        }
        // 幂曲线增强 + 限幅
        const raw = Math.min(1, Math.pow(linear, 0.7))
        smoothRef.current += (raw - smoothRef.current) * 0.35
        volumeRef.current = smoothRef.current
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)

      return stream

    } catch (err: any) {
      const msg = err?.message || String(err)
      console.error('[Mic] error:', msg)
      setError(msg)
      cleanup()
      throw err
    }
  }, [cleanup])

  const stop = useCallback(() => {
    console.log('[Mic] stopping')
    cleanup()
    setListening(false)
  }, [cleanup])

  useEffect(() => () => { cleanup() }, [cleanup])

  return { volumeRef, listening, start, stop, error }
}
