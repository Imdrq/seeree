# Seeree

Seeree 是一款基于 Electron 构建的本地 AI 语音助手，专为 Windows 打造，让 Windows 用户也能获得类似 macOS 上 Siri 的语音交互体验。macOS 已有 Siri，因此本应用不兼容、也不计划支持 macOS。

液态玻璃悬浮球常驻桌面，点击气泡或按住 T 键即可说话，玻璃球会随音量以彩色丝带动态律动。

作者：Ricky。当前版本 0.0.1 正式版。

---

# 中文说明

## 功能特性

**本地离线语音识别**：基于 Vosk（WebAssembly 离线推理），中文高精度模型，不上传任何音频。

**AI 后端**：0.0.1 版本仅支持 Ollama 本地后端，建议使用 qwen2.5:1.5b 模型。

**语音回复**：系统语音朗读 AI 回答，说话时丝带随音量律动反馈。

**悬浮球交互**：常驻桌面、托盘驻留、Alt+Space 全局显示或隐藏；点击气泡或按住 T 键说话。

## 快速开始

```
npm install
npm run dev
```

## 语音模型

识别使用 vosk-browser（WebAssembly 离线推理）。当前附带中文模型 vosk-model-small-cn-0.22，位于 models 目录，随安装包一并分发，无需手动下载。如需换用其他模型，将对应的 tar.gz 放入 models 目录即可。

## AI 后端配置

0.0.1 版本仅支持 Ollama 本地后端，建议使用 qwen2.5:1.5b 模型。

安装并启动 Ollama（默认端口 11434），然后拉取推荐模型：

```
ollama pull qwen2.5:1.5b
```

打开 Seeree 设置窗口，Provider 选择 Ollama，模型选择 qwen2.5:1.5b，连接测试通过后即可使用。

## 构建打包

```
npm run build
npx electron-builder --win nsis        # 安装包（支持一键卸载）
npx electron-builder --win portable    # 便携版（免安装，删除即卸载）
```

打包产物输出到 release 目录，图标来自 assets/app-icon.png。

## 项目结构

```
electron                主进程：窗口、托盘、AI 接口、模型协议
src/renderer            渲染进程：React UI、玻璃气泡、丝带动画
models                  离线语音模型（随包分发）
assets                  应用图标与托盘图标
docs                    发布与打包说明
electron-builder.yml    打包配置
```

## 技术栈

Electron、electron-vite、React、TypeScript、vosk-browser、Canvas 2D 玻璃丝带动画、electron-builder 打包分发。

---

# English Documentation

## Features

**Local offline speech recognition**: Powered by Vosk (WebAssembly offline inference), with a high-accuracy Chinese model. No audio is uploaded anywhere.

**AI backend**: Version 0.0.1 supports only the local Ollama backend, with qwen2.5:1.5b recommended.

**Voice replies**: AI answers are read aloud through system TTS, with the ribbon animating in sync with your voice.

**Floating bubble interaction**: Stays on the desktop, dwells in the system tray, and toggles globally with Alt+Space. Click the bubble or hold the T key to speak.

## Quick Start

```
npm install
npm run dev
```

## Speech Model

Recognition uses vosk-browser for offline inference. The bundled Chinese model vosk-model-small-cn-0.22 ships inside the installer under the models folder, so no manual download is needed. To use a different model, place its tar.gz archive into the models folder.

## AI Backend

Version 0.0.1 supports only the local Ollama backend, with qwen2.5:1.5b recommended.

Install and start Ollama (default port 11434), then pull the recommended model:

```
ollama pull qwen2.5:1.5b
```

In the Seeree settings window, choose Ollama as the provider and select qwen2.5:1.5b, then test the connection to start using it.

## Build & Package

```
npm run build
npx electron-builder --win nsis        # installer (one-click uninstall)
npx electron-builder --win portable    # portable (delete to uninstall)
```

Build output goes to the release folder, using the icon at assets/app-icon.png.

## Project Structure

```
electron                Main process: window, tray, AI API, model protocol
src/renderer            Renderer process: React UI, bubble, ribbon
models                  Offline speech models (bundled)
assets                  App and tray icons
docs                    Release and packaging notes
electron-builder.yml    Packaging config
```

## Tech Stack

Electron, electron-vite, React, TypeScript, vosk-browser, Canvas 2D glass ribbon animation, and electron-builder for packaging.
