# Seeree

Seeree 是一款基于 Electron 构建的本地 AI 语音助手，专为 Windows 打造，让 Windows 用户也能获得类似 macOS 上 Siri 的语音交互体验。macOS 已有 Siri，因此本应用不兼容、也不计划支持 macOS。

液态玻璃悬浮球默认停靠在屏幕右上角，点击气泡或按 Ctrl+Shift+V 即可说话，玻璃球会随音量以彩色丝带动态律动。首次启动会进入一分钟引导，可选语言、主题并录制快捷键。

作者：Ricky。当前版本 0.1.1。

---

# 中文说明

## 功能特性

**首次使用引导**：首次启动弹出引导向导，依次选择语言（中/英）、主题（紫蓝/黑曜石），并录制输入面板与语音对话的快捷键，随时可在「个性化」设置中修改。

**本地离线语音识别**：基于 whisper.cpp（原生推理），中文高精度模型（ggml-small），不上传任何音频。录音直接采集 PCM 无损数据，自动静音检测断句。

**AI 后端**：支持 Ollama（本地）、OpenAI、Claude、Custom（OpenAI 兼容端点，如 LM Studio、DeepSeek、Moonshot）。Ollama 建议使用 qwen2.5:7b 或更高版本。

**联网搜索**：内置 SearXNG 元搜索（免费无 API Key），支持自定义实例地址。搜索结果自动注入 AI 回答并标注来源。

**语音回复**：系统语音朗读 AI 回答，说话时丝带随音量律动反馈。

**语音记事本**：说"记事"后 Seeree 会提示"开始记录"，你接着说的话将被保存为文本文档。首次使用会在桌面创建「seeree记事本」文件夹，后续记录都存放在其中。

**连续会话**：说一次话或点一次气泡后可持续对话，回答完自动接着听下一句。说"结束"、"再见"可退出，或点击气泡、按 Esc 结束。支持空闲自动超时和窗口失焦自动取消。

**打招呼自我介绍**：说"你好"等问候语时，Seeree 会介绍自己是语音助手；日常问答则不会自我介绍。

**悬浮球交互**：默认停靠屏幕右上角，托盘驻留、Alt+Space 全局显示或隐藏。窗口随界面自动缩放：气泡态紧凑贴边，设置面板展开为完整窗口；设置按钮紧贴气泡右上角，拖拽透明区域可自由移动。液态玻璃 WebGL 渲染，Fresnel 边缘辉光 + 色散效果。

## 使用方法

### 启动对话

| 操作 | 说明 |
|------|------|
| **Ctrl+Shift+V**（可改） | 开始语音对话（连续模式，回答完自动接着听） |
| **Ctrl+T**（可改） | 打开文字输入面板，再按一次收起 |
| **点击气泡** | 开始说话 |
| **Alt+Space** | 显示/隐藏悬浮球 |
| **Esc / 点击气泡** | 结束连续对话 |

### 语音指令

| 说 | 效果 |
|----|------|
| "你好" | Seeree 自我介绍 |
| "记事" | 进入记录模式，下一句话保存为文本文档 |
| "结束" / "再见" | 退出连续对话 |
| 其他任意内容 | 由 AI 回答（需要联网搜索时自动搜索） |

### 语音记事

1. 说"**记事**"，Seeree 提示"开始记录"
2. 说出要记录的内容
3. 自动保存到桌面「seeree记事本」文件夹

### 联网搜索

在需要时自动触发（如"今天天气"、"搜索XXX"），搜索结果会注入 AI 回答并标注来源。可在「联网设置」中开关和配置。

### 空闲与安全

- 连续对话中 **30 秒无语音** 自动退出（AI 回答期间不计时）
- 窗口失焦/最小化时自动取消当前聆听（AI 回答期间不受影响）
- AI 回答期间点击/快捷键不可打断（可在「其他设置」中关闭）

## 快速开始

```
npm install
npm run dev
```

首次启动会进入引导向导：选语言、选主题、录制输入面板快捷键（默认 Ctrl+T）和语音快捷键（默认 Ctrl+Shift+V），完成后气泡停靠在屏幕右上角。

## 语音识别

识别使用 whisper.cpp（原生推理），模型 ggml-small（465MB）位于 `whisper.cpp/` 目录。首次使用需运行安装脚本：

```
powershell -ExecutionPolicy Bypass -File install-whisper.ps1
```

如需换用其他模型（如 ggml-base 141MB），将模型文件放入 `whisper.cpp/` 目录并修改 `electron/services/whisper/WhisperService.ts` 中的模型路径。

## AI 后端配置

支持四种 Provider：Ollama（本地）、OpenAI、Claude、Custom（OpenAI 兼容端点）。

### Ollama（推荐，完全本地）

安装并启动 Ollama（默认端口 11434），然后拉取推荐模型：

```
ollama pull qwen2.5:7b
```

打开 Seeree 设置窗口，Provider 选择 Ollama，模型选择 qwen2.5:7b，连接测试通过后即可使用。

### OpenAI / Claude / Custom

在设置窗口选择对应 Provider，填入 API Key 即可。Custom 模式可填入 DeepSeek、Moonshot 等国内服务的 Base URL + API Key。API Key 通过系统级加密（safeStorage）保存在本地，不会明文存储。

## 联网搜索

设置面板「联网设置」中启用。默认使用 SearXNG 元搜索（免费无限制），支持自定义实例地址。需要时自动搜索并将结果注入 AI 回答。

## 构建打包

```
npm run build
npm run package
```

打包产物输出到 release 目录，图标来自 assets/app-icon.png。包含 NSIS 安装包和便携版两种格式：

- `seeree-windows-Setup-<版本>.exe` — 安装版（可选安装目录，卸载可清空用户数据）
- `Seeree-portable-<版本>.exe` — 免安装便携版

打包前需已运行 `install-whisper.ps1` 准备好 whisper.cpp 运行时与模型，它们会作为 extraResources 打进安装包。

## 项目结构

```
electron/               主进程：窗口、托盘、AI 接口、Whisper 转写
  services/whisper/     whisper.cpp CLI 封装
src/renderer/           渲染进程：React UI、玻璃气泡、丝带动画
  components/           GlassBubble、ControlPanel、Onboarding、LiquidGlassCanvas、识别 hooks
  shaders/              液态玻璃 GLSL 着色器
src/services/search/    联网搜索 Provider 抽象
whisper.cpp/            whisper.cpp 运行时与模型
assets/                 应用图标与托盘图标
docs/                   发布与打包说明
```

## 技术栈

Electron、electron-vite、React、TypeScript、whisper.cpp、WebGL 液态玻璃着色器、Canvas 2D 玻璃丝带动画、electron-builder 打包分发。

---

# English Documentation

## Features

**First-run onboarding**: On first launch, a short wizard walks you through language (Chinese/English), theme (purple-blue/obsidian), and recording your input-panel and voice hotkeys. Change any of these later under Settings → Personal.

**Local offline speech recognition**: Powered by whisper.cpp (native inference) with the ggml-small Chinese model. Audio is captured as raw PCM with automatic silence detection. No audio is uploaded anywhere.

**AI backend**: Supports Ollama (local), OpenAI, Claude, and Custom (OpenAI-compatible endpoints such as LM Studio, DeepSeek, Moonshot). For Ollama, qwen2.5:7b or higher is recommended.

**Web search**: Built-in SearXNG metasearch (free, no API key) with configurable instance URL. Search results are automatically injected into AI responses with source citations.

**Voice replies**: AI answers are read aloud through system TTS, with the ribbon animating in sync with your voice.

**Voice notes**: Say "note" and Seeree will prompt "start recording"; whatever you say next is saved to a text file. On first use, a folder named "seeree记事本" is created on the desktop, and all subsequent notes are stored there.

**Continuous conversation**: Start once (click the bubble or press Ctrl+Shift+V) to keep talking — after each answer, Seeree listens again automatically. Say "结束/再见" (end/goodbye) to exit, or click the bubble / press Esc to end. Supports idle timeout and auto-cancel on window blur.

**Greeting intro**: Say "你好" (hello) and Seeree introduces itself as a voice assistant; in everyday Q&A it won't self-introduce.

**Floating bubble interaction**: Docks to the top-right corner of the screen, dwells in the system tray, and toggles globally with Alt+Space. The window auto-sizes — compact for the bubble, expanded for settings — and the gear button sits right on the bubble. Drag the transparent area to reposition. Liquid glass WebGL rendering with Fresnel edge glow and chromatic dispersion.

## Usage

### Starting a conversation

| Action | Description |
|--------|-------------|
| **Ctrl+Shift+V** (customizable) | Start voice conversation (continuous mode, auto-listens after each answer) |
| **Ctrl+T** (customizable) | Open the text input panel; press again to collapse |
| **Click bubble** | Start speaking |
| **Alt+Space** | Show/hide the bubble |
| **Esc / Click bubble** | End continuous conversation |

### Voice commands

| Say | Effect |
|-----|--------|
| "你好" (hello) | Seeree introduces itself |
| "记事" (note) | Enter note mode, next sentence is saved as a text file |
| "结束" / "再见" (end/bye) | Exit continuous conversation |
| Anything else | Answered by AI (auto-searches when needed) |

### Voice notes

1. Say "**记事**" (note), Seeree prompts "start recording"
2. Speak the content to record
3. Saved to the "seeree记事本" folder on your desktop

### Web search

Triggers automatically when needed (e.g. "what's the weather", "search for X"). Results are injected into the AI response with source citations. Toggle and configure in Settings → Network.

### Idle & safety

- **30s idle timeout** exits continuous conversation (paused during AI responses)
- **Window blur/minimize** auto-cancels listening (AI responses unaffected)
- **AI responses cannot be interrupted** by click/shortcut (configurable in Settings → Other)

## Quick Start

```
npm install
npm run dev
```

On first launch the onboarding wizard appears: pick language and theme, then record your input-panel hotkey (default Ctrl+T) and voice hotkey (default Ctrl+Shift+V). The bubble then docks to the top-right corner of your screen.

## Speech Recognition

Recognition uses whisper.cpp (native inference). The ggml-small model (465MB) lives in the `whisper.cpp/` folder. Run the install script on first use:

```
powershell -ExecutionPolicy Bypass -File install-whisper.ps1
```

To use a different model (e.g. ggml-base at 141MB), place the model file in `whisper.cpp/` and update the model path in `electron/services/whisper/WhisperService.ts`.

## AI Backend

Four providers are supported: Ollama (local), OpenAI, Claude, and Custom (OpenAI-compatible endpoints).

### Ollama (recommended, fully local)

Install and start Ollama (default port 11434), then pull the recommended model:

```
ollama pull qwen2.5:7b
```

In the Seeree settings window, choose Ollama as the provider and select qwen2.5:7b, then test the connection to start using it.

### OpenAI / Claude / Custom

Select the provider in settings and fill in your API Key. Custom mode supports DeepSeek, Moonshot, and other endpoints with Base URL + API Key. Keys are stored locally using system-level encryption (safeStorage), never in plaintext.

## Web Search

Enable in Settings → Network. Defaults to SearXNG metasearch (free, unlimited) with configurable instance URL. Results are automatically injected into AI responses when needed.

## Build & Package

```
npm run build
npm run package
```

Build output goes to the release folder, using the icon at assets/app-icon.png. Includes both NSIS installer and portable formats:

- `seeree-windows-Setup-<version>.exe` — installer (choose install dir; uninstall can wipe user data)
- `Seeree-portable-<version>.exe` — portable, no install required

Run `install-whisper.ps1` before packaging so the whisper.cpp runtime and model are bundled as extraResources.

## Project Structure

```
electron/               Main process: window, tray, AI API, Whisper transcription
  services/whisper/     whisper.cpp CLI wrapper
src/renderer/           Renderer process: React UI, glass bubble, ribbon animation
  components/           GlassBubble, ControlPanel, Onboarding, LiquidGlassCanvas, recognition hooks
  shaders/              Liquid glass GLSL shaders
src/services/search/    Web search provider abstraction
whisper.cpp/            whisper.cpp runtime and models
assets/                 App and tray icons
docs/                   Release and packaging notes
```

## Tech Stack

Electron, electron-vite, React, TypeScript, whisper.cpp, WebGL liquid glass shaders, Canvas 2D glass ribbon animation, and electron-builder for packaging.
