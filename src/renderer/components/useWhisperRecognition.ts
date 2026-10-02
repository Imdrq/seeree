import { useCallback, useRef } from 'react'

/**
 * Whisper 语音识别 hook（渲染层）
 * 直接录 PCM 无损音频 → WAV → 主进程 whisper.cpp 转写
 * 不经过 Opus 压缩，保证音频质量
 */

export interface RecognitionResult {
  text: string
  error?: string
}

/** 将 PCM Float32 数据转为 16-bit WAV */
function pcmToWav(pcm: Float32Array, sampleRate: number): Blob {
  const numChannels = 1
  const bitDepth = 16
  const bytesPerSample = bitDepth / 8
  const blockAlign = numChannels * bytesPerSample
  const dataSize = pcm.length * blockAlign
  const headerSize = 44

  const ab = new ArrayBuffer(headerSize + dataSize)
  const view = new DataView(ab)

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }

  writeStr(0, 'RIFF')
  view.setUint32(4, headerSize + dataSize - 8, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)           // PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
    offset += 2
  }

  return new Blob([ab], { type: 'audio/wav' })
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export default function useWhisperRecognition() {
  const isRecordingRef = useRef(false)

  /**
   * 录音（静音检测自动停止）→ WAV → 转写
   * 直接采集 PCM，无损质量
   */
  const recognize = useCallback((
    timeoutMs = 15000,
    onPartial?: (status: string) => void,
    externalStream?: MediaStream
  ): Promise<RecognitionResult> => {
    return new Promise((resolve) => {
      if (isRecordingRef.current) {
        resolve({ text: '', error: '正在录音中' })
        return
      }
      isRecordingRef.current = true

      let settled = false
      let silenceMs = 0
      let stream: MediaStream | null = null
      let audioCtx: AudioContext | null = null
      let processor: ScriptProcessorNode | null = null
      let processing = false // 防止 processAndFinish 重入
      const pcmChunks: Float32Array[] = []
      const SILENCE_LIMIT = 1500
      const SILENCE_RMS = 0.005
      const SAMPLE_RATE = 16000  // Whisper 原生采样率

      const cleanup = () => {
        try { processor?.disconnect() } catch { /* ok */ }
        stream?.getTracks().forEach((t) => { if (!externalStream) t.stop() })
        try { audioCtx?.close() } catch { /* ok */ }
      }

      const finish = (text: string, error?: string) => {
        if (settled) return
        settled = true
        cleanup()
        isRecordingRef.current = false
        resolve(error ? { text: '', error } : { text })
      }

      ;(async () => {
        try {
          // 1. 获取麦克风 — 高质量采集参数
          stream = externalStream || await navigator.mediaDevices.getUserMedia({
            audio: {
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: false,
              autoGainControl: true,
              sampleRate: { ideal: SAMPLE_RATE },
            }
          })
          console.log('[Whisper] stream acquired, tracks:', stream.getAudioTracks().length, 'external:', !!externalStream)

          onPartial?.('正在聆听...')

          // 2. AudioContext 直接采集 PCM（无损，不过 Opus）
          try {
            audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE })
          } catch {
            audioCtx = new AudioContext() // 设备不支持 16k 时降级
          }
          // 确保 AudioContext 处于运行状态（Chrome/Electron 自动播放策略可能挂起）
          if (audioCtx.state === 'suspended') {
            await audioCtx.resume()
          }
          const source = audioCtx.createMediaStreamSource(stream)
          processor = audioCtx.createScriptProcessor(4096, 1, 1)

          // 静音节点防止回声
          const mute = audioCtx.createGain()
          mute.gain.value = 0

          source.connect(processor)
          processor.connect(mute)
          mute.connect(audioCtx.destination)

          // 3. 持续采集 PCM + 静音检测
          processor.onaudioprocess = (e) => {
            if (settled || processing) return
            const input = e.inputBuffer.getChannelData(0)

            // 保存 PCM 数据
            const copy = new Float32Array(input.length)
            copy.set(input)
            pcmChunks.push(copy)

            // 静音检测
            let sum = 0
            for (let i = 0; i < input.length; i++) sum += input[i] * input[i]
            const rms = Math.sqrt(sum / input.length)
            if (rms < SILENCE_RMS) {
              silenceMs += (input.length / (audioCtx?.sampleRate || SAMPLE_RATE)) * 1000
            } else {
              silenceMs = 0
            }

            // 静音超限 → 停止录音并转写
            if (silenceMs > SILENCE_LIMIT && pcmChunks.length > 0) {
              console.log('[Whisper] silence detected, processing', pcmChunks.length, 'chunks')
              processAndFinish()
            }
          }

          // 4. 总超时兜底
          setTimeout(() => {
            if (!settled && !processing && pcmChunks.length > 0) {
              console.log('[Whisper] timeout, processing', pcmChunks.length, 'chunks')
              processAndFinish()
            } else if (!settled && !processing) {
              console.log('[Whisper] timeout, no audio captured')
              finish('', '未检测到语音')
            }
          }, timeoutMs)

          async function processAndFinish() {
            if (settled || processing) return
            processing = true
            onPartial?.('正在转写...')

            try {
              // 合并所有 PCM 块
              const totalLen = pcmChunks.reduce((n, c) => n + c.length, 0)
              const pcm = new Float32Array(totalLen)
              let off = 0
              for (const chunk of pcmChunks) {
                pcm.set(chunk, off)
                off += chunk.length
              }
              console.log('[Whisper] PCM total samples:', totalLen, 'duration:', (totalLen / (audioCtx?.sampleRate || SAMPLE_RATE)).toFixed(2), 's')

              // 直接转 WAV（16kHz 16-bit mono）
              const wavBlob = pcmToWav(pcm, audioCtx?.sampleRate || SAMPLE_RATE)
              const wavBase64 = await blobToBase64(wavBlob)
              console.log('[Whisper] WAV base64 length:', wavBase64.length)

              const result = await window.electronAPI?.whisperTranscribe?.({
                audio: wavBase64,
                language: 'zh',
              })
              console.log('[Whisper] result:', result?.ok, result?.text?.slice(0, 50))

              if (result?.ok && result.text) {
                finish(result.text)
              } else {
                finish('', result?.message || '转写失败')
              }
            } catch (err: any) {
              console.error('[Whisper] error:', err)
              finish('', `转写失败: ${err?.message || String(err)}`)
            }
          }

        } catch (err: any) {
          finish('', `麦克风访问失败: ${err?.message || String(err)}`)
        }
      })()
    })
  }, [])

  return { recognize }
}
