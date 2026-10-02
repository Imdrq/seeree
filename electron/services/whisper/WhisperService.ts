import { execFile } from 'child_process'
import { writeFile, unlink, mkdir, access } from 'fs/promises'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { app } from 'electron'
import { randomBytes } from 'crypto'

/**
 * Whisper 转写服务（主进程）
 * 通过 whisper.cpp CLI 将 WAV 音频转为文字
 */

// whisper.cpp 可执行文件路径
// dev: 项目根/whisper.cpp/main.exe
// prod: process.resourcesPath/whisper/main.exe
function getWhisperBin(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'whisper', 'whisper-cli.exe')
    : join(app.getAppPath(), 'whisper.cpp', 'whisper-cli.exe')
}

// 模型路径
function getModelPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'whisper', 'ggml-small.bin')
    : join(app.getAppPath(), 'whisper.cpp', 'ggml-small.bin')
}

interface WhisperResult {
  ok: boolean
  text: string
  message?: string
}

/**
 * 将 WAV 音频转写为文字
 * @param wavBuffer WAV 格式的音频数据
 * @param language 语言代码（默认 'zh'）
 */
export async function transcribeAudio(wavBuffer: Buffer, language = 'zh'): Promise<WhisperResult> {
  const bin = getWhisperBin()
  const model = getModelPath()

  // 检查文件存在
  try {
    await access(bin)
    await access(model)
  } catch {
    return { ok: false, text: '', message: 'Whisper 未安装（缺少 main.exe 或模型文件）' }
  }

  // 写入临时 WAV 文件
  const tmpDir = join(tmpdir(), 'seeree-whisper')
  await mkdir(tmpDir, { recursive: true })
  const id = randomBytes(8).toString('hex')
  const wavPath = join(tmpDir, `audio-${id}.wav`)
  const outPath = join(tmpDir, `output-${id}`)

  try {
    await writeFile(wavPath, wavBuffer)

    // 运行 whisper.cpp
    const text = await runWhisper(bin, model, wavPath, outPath, language)
    return { ok: true, text: text.trim() }
  } catch (err: any) {
    return { ok: false, text: '', message: `转写失败：${err?.message || String(err)}` }
  } finally {
    // 清理临时文件
    unlink(wavPath).catch(() => {})
    unlink(`${outPath}.txt`).catch(() => {})
    unlink(`${outPath}.json`).catch(() => {})
    unlink(`${outPath}.srt`).catch(() => {})
    unlink(`${outPath}.vtt`).catch(() => {})
    unlink(`${outPath}.tsv`).catch(() => {})
  }
}

function runWhisper(bin: string, model: string, input: string, output: string, language: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      '-m', model,
      '-f', input,
      '-l', language,
      '-t', '4',              // 4 线程
      '--output-txt',         // 输出 txt
      '-of', output,
      '--no-timestamps',      // 不要时间戳
    ]

    const proc = execFile(bin, args, {
      timeout: 30000,         // 30 秒超时
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    }, async (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message))
        return
      }
      try {
        // whisper.cpp 输出到 output.txt 文件
        const { readFile } = await import('fs/promises')
        const content = await readFile(`${output}.txt`, 'utf-8')
        resolve(content)
      } catch {
        // 兜底：从 stdout 提取
        resolve(stdout || '')
      }
    })
  })
}
