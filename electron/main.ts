import { app, BrowserWindow, screen, globalShortcut, ipcMain, session, systemPreferences, protocol, net, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { statSync, createReadStream } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import { Readable } from 'stream'
import { is } from '@electron-toolkit/utils'
import OpenAI from 'openai'

// 防止外部注入的 NODE_OPTIONS（如 IDE 的 --require shim）污染打包应用，
// 否则会导致 Chromium 网络服务进程崩溃，应用内网络请求（模型加载/AI 接口）全部失败。
delete process.env.NODE_OPTIONS

// app:// 协议 — 用于加载本地语音识别模型（支持 fetch）
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
  }
])

const OPENAI_MODEL_MAP: Record<string, string> = {
  'GPT-5': 'gpt-4o',
  'GPT-4o': 'gpt-4o',
  'GPT-4-turbo': 'gpt-4-turbo',
  'GPT-3.5-turbo': 'gpt-3.5-turbo',
}

/* ═══════════ AI Provider 工具函数 ═══════════ */

const OLLAMA_DEFAULT_URL = 'http://localhost:11434'

function normalizeBaseUrl(url: string): string {
  if (!url) return OLLAMA_DEFAULT_URL
  const trimmed = url.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(trimmed)) return `http://${trimmed}`
  return trimmed
}

function friendlyFetchError(err: any): string {
  const cause = err?.cause ?? err
  const code = cause?.code || cause?.errno
  if (code === 'ECONNREFUSED') return '连接被拒绝。请确认 Ollama 已安装并正在运行（默认端口 11434）'
  if (code === 'ECONNRESET') return '连接被重置，请检查网络或服务状态'
  if (code === 'ETIMEDOUT') return '连接超时，请检查地址与网络'
  if (code === 'ENOTFOUND') return '地址无法解析，请检查 Base URL 是否正确'
  return err?.message || String(err)
}

async function fetchOllamaTags(baseUrl: string): Promise<{ ok: boolean; models: string[]; message?: string }> {
  const url = `${normalizeBaseUrl(baseUrl)}/api/tags`
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!resp.ok) return { ok: false, models: [], message: `Ollama 服务异常 (HTTP ${resp.status})` }
    const data = await resp.json() as { models?: { name: string }[] }
    const models = (data.models || []).map((m) => m.name).sort()
    return { ok: true, models }
  } catch (err: any) {
    return { ok: false, models: [], message: friendlyFetchError(err) }
  }
}

async function chatWithOllama(baseUrl: string, model: string, messages: { role: string; content: string }[], signal?: AbortSignal): Promise<string> {
  const url = `${normalizeBaseUrl(baseUrl)}/api/chat`
  let resp: Response
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false, options: { temperature: 0.7 } }),
      signal,
    })
  } catch (err: any) {
    throw new Error(`无法连接 Ollama：${friendlyFetchError(err)}`)
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    if (resp.status === 404 && /model/i.test(body)) {
      throw new Error(`模型 "${model}" 未安装。请先在终端运行：ollama pull ${model}`)
    }
    throw new Error(`Ollama 错误 (HTTP ${resp.status})：${body.slice(0, 200)}`)
  }
  const data = await resp.json() as { message?: { content?: string } }
  return data.message?.content || ''
}

async function chatWithClaude(apiKey: string, model: string, messages: { role: string; content: string }[], signal?: AbortSignal): Promise<string> {
  const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n')
  const rest = messages.filter((m) => m.role !== 'system')
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1000,
        system: sys || undefined,
        messages: rest,
      }),
      signal,
    })
    if (!resp.ok) {
      const body = await resp.text().catch(() => '')
      throw new Error(`Claude 错误 (HTTP ${resp.status})：${body.slice(0, 200)}`)
    }
    const data = await resp.json() as { content?: { text?: string }[] }
    return (data.content || []).map((c) => c.text || '').join('')
  } catch (err: any) {
    if (err?.message?.startsWith('Claude')) throw err
    throw new Error(`无法连接 Claude：${friendlyFetchError(err)}`)
  }
}

// 允许 localhost 访问媒体设备
app.commandLine.appendSwitch('unsafely-treat-insecure-origin-as-secure', 'http://localhost:5173')

let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let tray: Tray | null = null
/** 进行中的 AI 请求控制器（取消时中止，防止"双回答"） */
let activeChatController: AbortController | null = null

/** 显示/隐藏主窗口（供托盘菜单与快捷键复用） */
function toggleMainWindow(): void {
  if (!mainWindow) return
  if (settingsWindow && !settingsWindow.isDestroyed() && settingsWindow.isVisible()) {
    settingsWindow.close()
  }
  if (mainWindow.isVisible()) {
    mainWindow.hide()
  } else {
    mainWindow.show()
    mainWindow.focus()
  }
}

/** 系统托盘：提供显示/隐藏与退出入口 */
function createTray(): void {
  const iconPath = is.dev
    ? join(__dirname, '../../assets/tray-icon.png')
    : join(process.resourcesPath, 'assets/tray-icon.png')
  const icon = nativeImage.createFromPath(iconPath)
  if (icon.isEmpty()) {
    console.warn('[tray] icon not found:', iconPath)
    return
  }
  tray = new Tray(icon.resize({ width: 16, height: 16 }))
  tray.setToolTip('Seeree 语音助手')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示 / 隐藏', click: () => toggleMainWindow() },
    { type: 'separator' },
    { label: '退出 Seeree', click: () => app.quit() },
  ]))
  tray.on('click', () => toggleMainWindow())
}

function getRendererURL(hash?: string): string {
  const baseURL = is.dev && process.env['ELECTRON_RENDERER_URL']
    ? process.env['ELECTRON_RENDERER_URL']
    : `file://${join(__dirname, '../renderer/index.html')}`
  return hash ? `${baseURL}#${hash}` : baseURL
}

function createWindow(): void {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize

  mainWindow = new BrowserWindow({
    width: 360,
    height: 216,
    x: screenWidth - 370,
    y: 30,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    focusable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.setAlwaysOnTop(true)
  mainWindow.loadURL(getRendererURL())
}

function registerIpcHandlers(): void {
  ipcMain.handle('resize-for-settings', () => {
    if (!mainWindow) return
    mainWindow.setSize(480, 560)
    mainWindow.center()
    mainWindow.setResizable(false)
  })

  ipcMain.handle('resize-for-bubble', () => {
    if (!mainWindow) return
    const { width: screenW } = screen.getPrimaryDisplay().workAreaSize
    mainWindow.setSize(360, 216)
    mainWindow.setPosition(screenW - 370, 30)
    mainWindow.setResizable(true)
  })

  ipcMain.handle('hide-window', () => {
    mainWindow?.hide()
  })

  ipcMain.handle('quit-app', () => {
    app.quit()
  })

  ipcMain.handle('open-settings', () => {
    if (!mainWindow) return

    // 已有设置窗口 → 直接复用
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.show()
      settingsWindow.focus()
      mainWindow.hide()
      return
    }

    const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize
    const winW = 480
    const winH = 560

    settingsWindow = new BrowserWindow({
      width: winW,
      height: winH,
      x: Math.round((screenW - winW) / 2),
      y: Math.round((screenH - winH) / 2),
      transparent: false,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      hasShadow: true,
      backgroundColor: '#0d0d1f',
      focusable: true,
      webPreferences: {
        preload: join(__dirname, '../preload/preload.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    settingsWindow.setAlwaysOnTop(true, 'floating')

    settingsWindow.on('closed', () => {
      settingsWindow = null
      mainWindow?.show()
      mainWindow?.focus()
    })

    settingsWindow.loadURL(getRendererURL('settings'))
    // 延迟隐藏主窗口，确保设置窗口先获得焦点
    setTimeout(() => {
      mainWindow?.hide()
    }, 300)
  })

  ipcMain.handle('close-settings', () => {
    if (settingsWindow) {
      settingsWindow.close()
      settingsWindow = null
    }
    mainWindow?.show()
    mainWindow?.focus()
  })

  // 窗口拖拽 — 自动识别当前活跃窗口
  ipcMain.handle('move-window', (_, delta: { dx: number; dy: number }) => {
    const win = settingsWindow && !settingsWindow.isDestroyed() && settingsWindow.isVisible()
      ? settingsWindow
      : mainWindow
    if (!win || win.isDestroyed()) return
    const [x, y] = win.getPosition()
    win.setPosition(x + delta.dx, y + delta.dy)
  })

  // ═══════════ AI API ═══════════

  ipcMain.handle('test-connection', async (_, params: { provider: string; model: string; apiKey: string; baseUrl: string }) => {
    const { provider, model, apiKey, baseUrl } = params

    // ── Ollama：本地服务，检查 /api/tags ──
    if (provider === 'ollama') {
      const res = await fetchOllamaTags(baseUrl)
      if (!res.ok) {
        return { ok: false, message: `Ollama 连接失败：${res.message}` }
      }
      if (res.models.length === 0) {
        return { ok: false, message: 'Ollama 已连接，但未安装任何模型。请先在终端运行：ollama pull llama3.1' }
      }
      const hasModel = res.models.includes(model)
      const tip = hasModel ? '' : `（注意：当前选择的 "${model}" 不在已安装列表中）`
      return { ok: true, message: `Ollama 连接成功，共 ${res.models.length} 个模型：${res.models.slice(0, 5).join(', ')}${res.models.length > 5 ? '…' : ''}${tip}` }
    }

    // ── OpenAI / Custom（OpenAI 兼容端点，可指向本地服务如 LM Studio）──
    if (provider === 'openai' || provider === 'custom') {
      if (!apiKey) {
        return { ok: false, message: provider === 'custom' ? '请填写 API Key（兼容服务一般也需要）' : '请先填写 API Key' }
      }
      try {
        const openai = new OpenAI({ apiKey, baseURL: baseUrl || undefined, dangerouslyAllowBrowser: true })
        const mappedModel = OPENAI_MODEL_MAP[model] || model
        const resp = await openai.chat.completions.create({
          model: mappedModel,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5,
        })
        return { ok: true, message: `${provider === 'custom' ? 'Custom' : 'OpenAI'} 连接成功 (${resp.model})` }
      } catch (err: any) {
        const msg = err?.message || String(err)
        return { ok: false, message: `连接失败: ${msg}` }
      }
    }

    // ── Claude ──
    if (provider === 'claude') {
      if (!apiKey) {
        return { ok: false, message: '请先填写 API Key' }
      }
      try {
        const reply = await chatWithClaude(apiKey, model, [{ role: 'user', content: 'ping' }])
        return { ok: true, message: `Claude 连接成功，模型响应: ${(reply || 'ok').slice(0, 30)}` }
      } catch (err: any) {
        return { ok: false, message: err?.message || String(err) }
      }
    }

    return { ok: false, message: `暂不支持 Provider: ${provider}` }
  })

  // ── 获取 Ollama 本地已安装模型列表 ──
  ipcMain.handle('list-ollama-models', async (_, baseUrl: string) => {
    return fetchOllamaTags(baseUrl)
  })

  ipcMain.handle('chat-completion', async (_, params: {
    provider: string
    apiKey: string
    model: string
    baseUrl: string
    messages: { role: string; content: string }[]
  }) => {
    const { provider, apiKey, model, baseUrl, messages } = params

    // 每个新请求中止上一个未完成的请求（防止"双回答"）
    activeChatController?.abort()
    const controller = new AbortController()
    activeChatController = controller
    const signal = controller.signal

    try {
      if (provider === 'ollama') {
        return await chatWithOllama(baseUrl, model, messages, signal)
      }
      if (provider === 'claude') {
        if (!apiKey) throw new Error('API Key 未配置')
        return await chatWithClaude(apiKey, model, messages, signal)
      }
      // openai / custom
      if (!apiKey) throw new Error('API Key 未配置')
      const openai = new OpenAI({ apiKey, baseURL: baseUrl || undefined, dangerouslyAllowBrowser: true })
      const mappedModel = OPENAI_MODEL_MAP[model] || model
      const resp = await openai.chat.completions.create({
        model: mappedModel,
        messages: messages as any,
        temperature: 0.7,
        max_tokens: 1000,
        signal,
      })
      return resp.choices[0]?.message?.content || ''
    } finally {
      if (activeChatController === controller) activeChatController = null
    }
  })

  // 取消当前 AI 请求（渲染进程取消对话时调用）
  ipcMain.handle('abort-chat', () => {
    activeChatController?.abort()
    activeChatController = null
  })

  // ── 记事本：把用户说的话保存到桌面「seeree记事本」文件夹的 txt 文档 ──
  ipcMain.handle('save-note', async (_, text: string) => {
    try {
      const content = (text || '').trim()
      if (!content) return { ok: false, message: '记录内容为空' }

      // 桌面/seeree记事本（首次自动创建）
      const noteDir = join(app.getPath('desktop'), 'seeree记事本')
      await mkdir(noteDir, { recursive: true })

      // 文件名：按时间戳命名，如 2026-08-28_14-30-05.txt
      const d = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      const filename = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.txt`
      const filePath = join(noteDir, filename)
      await writeFile(filePath, content + '\n', 'utf-8')
      return { ok: true, path: filePath }
    } catch (err: any) {
      return { ok: false, message: err?.message || '记事保存失败' }
    }
  })
}

function registerShortcuts(): void {
  globalShortcut.register('Alt+Space', () => {
    if (!mainWindow) return
    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

app.whenReady().then(() => {
  // 麦克风权限 — 同时处理 request 和 check
  const allowMedia = (_wc: any, permission: string, cb: (allowed: boolean) => void) => {
    if (permission === 'media' || permission === 'mediaKeySystem') { cb(true); return }
    cb(true)
  }
  session.defaultSession.setPermissionRequestHandler(allowMedia as any)
  session.defaultSession.setPermissionCheckHandler((_wc, permission, _origin, details) => {
    if (permission === 'media' || permission === 'mediaKeySystem') return true
    if (details?.mediaType === 'audio') return true
    return false
  })

  // Windows / macOS 请求麦克风权限
  try {
    const micStatus = systemPreferences.getMediaAccessStatus('microphone') as string
    if (micStatus !== 'granted') {
      systemPreferences.askForMediaAccess('microphone')
    }
  } catch {
    // systemPreferences media 状态在某些 OS 上不可用，忽略
  }

  // app:// 协议 → 本地模型目录（dev: 项目根 models/，prod: resources/models）
  const modelsDir = is.dev
    ? join(__dirname, '../../models')
    : join(process.resourcesPath, 'models')
  protocol.handle('app', (request) => {
    const url = new URL(request.url)
    const filePath = join(modelsDir, decodeURIComponent(url.pathname))
    // vosk-browser 需要下载 tar.gz 归档：显式提供 Content-Length / gzip MIME
    if (filePath.endsWith('.tar.gz')) {
      try {
        const stat = statSync(filePath)
        const webStream = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream
        return new Response(webStream, {
          headers: { 'Content-Type': 'application/gzip', 'Content-Length': String(stat.size) },
        })
      } catch {
        return new Response(`model archive not found: ${filePath}`, { status: 404 })
      }
    }
    return net.fetch(pathToFileURL(filePath).toString())
  })

  createWindow()
  registerIpcHandlers()
  registerShortcuts()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else {
      mainWindow?.show()
      mainWindow?.focus()
    }
  })
})

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll()
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
