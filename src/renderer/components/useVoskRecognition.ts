import { useCallback, useRef } from 'react'
import { createModel, type Model, type KaldiRecognizer } from 'vosk-browser'

// 严格还原 beta3：单中文模型 vosk-model-small-cn-0.22
const MODEL_URL = 'app://models/vosk-model-small-cn-0.22.tar.gz'

export interface RecognitionResult {
  text: string
  error?: string
}

/** 线性插值重采样（任意采样率 → 16kHz） */
function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input
  const ratio = fromRate / toRate
  const out = new Float32Array(Math.max(1, Math.round(input.length / ratio)))
  for (let i = 0; i < out.length; i++) {
    const idx = i * ratio
    const i0 = Math.floor(idx)
    const i1 = Math.min(i0 + 1, input.length - 1)
    const frac = idx - i0
    out[i] = input[i0] * (1 - frac) + input[i1] * frac
  }
  return out
}

/**
 * 本地离线语音识别（Vosk / WASM）
 * 不依赖网络，任何人都可直接使用。
 */
export default function useVoskRecognition() {
  const modelRef = useRef<Model | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const recognizerRef = useRef<KaldiRecognizer | null>(null)
  const totalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const finalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const ensureModel = useCallback(async (): Promise<boolean> => {
    if (modelRef.current?.ready) return true
    try {
      modelRef.current = await createModel(MODEL_URL)
      return true
    } catch (err) {
      console.error('[vosk] model load failed:', err)
      return false
    }
  }, [])

  const recognize = useCallback((
    timeoutMs = 12000,
    onPartial?: (partial: string) => void,
    externalStream?: MediaStream
  ): Promise<RecognitionResult> => {
    return new Promise((resolve) => {
      let settled = false
      let silenceMs = 0
      const SILENCE_LIMIT = 1000 // 静音 1s → 判定说话结束（缩短等待，降低延迟感）

      const cleanup = () => {
        if (totalTimerRef.current) clearTimeout(totalTimerRef.current)
        if (finalTimerRef.current) clearTimeout(finalTimerRef.current)
        try {
          processorRef.current?.disconnect()
          sourceRef.current?.disconnect()
          audioCtxRef.current?.close()
        } catch { /* ignore */ }
        // 复用外部流时不在此 stop（所有权归调用方 micStop 统一清理）
        if (!externalStream) {
          streamRef.current?.getTracks().forEach((t) => t.stop())
        }
        try { recognizerRef.current?.remove() } catch { /* ignore */ }
        processorRef.current = null
        sourceRef.current = null
        audioCtxRef.current = null
        streamRef.current = null
        recognizerRef.current = null
      }

      const finish = (text: string, error?: string) => {
        if (settled) return
        settled = true
        cleanup()
        resolve(error ? { text: '', error } : { text })
      }

      ;(async () => {
        // 1. 加载模型（懒加载）
        const ok = await ensureModel()
        if (!ok) { finish('', '本地语音模型加载失败'); return }
        const model = modelRef.current!

        // 2. 创建识别器
        let rec: KaldiRecognizer
        try {
          rec = new model.KaldiRecognizer(16000)
        } catch (err) {
          finish('', `识别器创建失败: ${String(err)}`)
          return
        }
        recognizerRef.current = rec

        rec.on('result', (msg: any) => {
          const text: string = msg?.result?.text || ''
          if (text.trim()) finish(text)
        })
        // 实时中间结果：说话过程中立即回显，消除"等很久才出字"的延迟感
        rec.on('partialresult', (msg: any) => {
          const partial: string = msg?.result?.partial || ''
          if (partial.trim()) onPartial?.(partial)
        })
        rec.on('error', (msg: any) => {
          finish('', `识别错误: ${msg?.error || 'unknown'}`)
        })

        // 3. 麦克风 + 音频管线（优先复用外部流，避免双流竞争麦克风导致丝带不动）
        let stream: MediaStream
        let ctx: AudioContext
        let source: MediaStreamAudioSourceNode
        let processor: ScriptProcessorNode
        try {
          if (externalStream) {
            stream = externalStream
          } else {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
            })
          }
          try {
            ctx = new AudioContext({ sampleRate: 16000 })
          } catch {
            ctx = new AudioContext() // 设备不支持 16k 时降级，后续重采样
          }
          source = ctx.createMediaStreamSource(stream)
          processor = ctx.createScriptProcessor(2048, 1, 1)
          source.connect(processor)
          processor.connect(ctx.destination)
        } catch (err: any) {
          finish('', `麦克风访问失败: ${err?.message || String(err)}`)
          return
        }
        streamRef.current = stream
        audioCtxRef.current = ctx
        sourceRef.current = source
        processorRef.current = processor

        // 4. 总超时兜底
        totalTimerRef.current = setTimeout(() => {
          try { rec.retrieveFinalResult() } catch { /* ok */ }
          finalTimerRef.current = setTimeout(() => finish(''), 800)
        }, timeoutMs)

        // 5. 持续喂音频 + 静音检测
        processor.onaudioprocess = (e) => {
          if (settled) return
          const input = e.inputBuffer.getChannelData(0)
          const pcm = resample(input, ctx.sampleRate, 16000)
          let sum = 0
          for (let i = 0; i < input.length; i++) sum += input[i] * input[i]
          const rms = Math.sqrt(sum / input.length)
          if (rms < 0.01) silenceMs += (input.length / ctx.sampleRate) * 1000
          else silenceMs = 0
          try { rec.acceptWaveformFloat(pcm, 16000) } catch { /* ok */ }

          // 静音足够久 → 强制取最终结果
          if (silenceMs > SILENCE_LIMIT) {
            try { rec.retrieveFinalResult() } catch { /* ok */ }
          }
        }
      })()
    })
  }, [ensureModel])

  return { recognize }
}
