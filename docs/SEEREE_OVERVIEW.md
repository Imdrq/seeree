# Seeree 项目总览文档

> 本文件是项目的「上下文备份」。当 AI 助手或协作者需要快速恢复项目认知时，请先读本文件。
> 最后更新：2026-08-23

---

## 1. 项目目标

- **产品名**：Seeree（原名 SiriAI，已改名）
- **类型**：Windows 桌面 AI 语音助手，Liquid Glass 玻璃质感悬浮气泡 UI
- **作者/制作者**：Ricky
- **核心能力**：
  1. 点击/快捷键唤起悬浮气泡，**本地离线语音识别**（vosk-browser + 本地小模型）
  2. 支持多种 AI Provider 对话：OpenAI、Claude、Ollama（本地）、Custom（OpenAI 兼容端点，如 LM Studio）
  3. 玻璃质感动画气泡（three.js / React Three Fiber），麦克风波形反馈
- **品牌呈现**：UI 显示品牌名 **Seeree**；设置面板显示 **"Seeree · Made by Ricky"**；exe 元数据 CompanyName 为 **Ricky**
- **体积红线**：整体分发包**必须保持轻量**（用户要求约 1GB 以内，当前 150MB）。禁止再引入 2GB 级别的大模型

---

## 2. 当前阶段

**版本：0.0.1beta4**（package.json `version: "0.0.1beta4"`）

> ⚠️ 2026-08-23 用户要求**完全回退到 beta3 代码**（包括依赖/模型），再从零修延迟+双回答。当前 beta4 = **严格还原 beta3 代码 + 修复**，非原 beta4 vosk 多语言版。

- ✅ 玻璃气泡 UI + 波形动画
- ✅ 本地语音识别：vosk-browser + **单中文模型 `vosk-model-small-cn-0.22`（41.8MB tar.gz，与 beta3 完全一致）**，走 `app://` 协议加载
- ✅ 严格还原 beta3：无语言切换（仅中文）、`useMicrophone` 双流（micStart/micStop）、`recognize(12000)` 懒加载模型
- ✅ 延迟修复（相对 beta3）：`partialresult` 实时中间结果（说话即出字）+ 静音阈值 1.8s→1s + 音频缓冲 4096→2048
- ✅ 双回答修复（beta3 的 bug）：主进程 `chat-completion` 使用 `AbortController`，新请求自动中止旧请求；取消对话时 `abort-chat` 中止进行中的 AI 请求
- ✅ AI 对话：OpenAI / Claude / Ollama / Custom 四路 Provider + 连接测试
- ✅ 系统托盘、Alt+Space 全局快捷键、设置面板、窗口拖拽
- ✅ 打包流程可用：electron-builder 产出 NSIS Setup + Portable，体积 **120.8MB**
- ⚠️ 待办/已知问题（历史遗留）：
  - 早期版本（beta1~beta3，113MB 左右）未打包模型，运行语音可能不可用；**请以 win-SiriAI 下最新 beta 文件为准**
  - 每次改完必须**实测打包版的语音识别**，不能只测启动（历史教训：打包版 vosk 失败会静默回退 Web Speech 并显示"不可用"）
  - release/ 目录若残留被系统进程（Defender/WSearch）锁定的旧 win-unpacked，打包会因无法清空输出目录而失败；可用 `--config.directories.output=release-new` 指定新输出目录绕过

---

## 3. 技术架构

```
Electron 33 + electron-vite 2 + electron-builder 25
React 18 + TypeScript + three.js / @react-three/fiber (R3F) + @react-three/drei
语音识别: vosk-browser 0.0.8（WASM 本地推理，完全离线）
AI: openai SDK / fetch (Claude, Ollama)
```

- **主进程** `electron/main.ts`：窗口管理、托盘、全局快捷键、IPC、`app://` 协议、AI Provider 调用、麦克风权限
- **渲染进程** `src/renderer/`：React UI（气泡 + 设置面板），通过 preload 暴露的 `window.electronAPI` 与主进程通信
- **语音识别链路**：`useVoskRecognition`(components) → vosk-browser `createModel(app://.../model.tar.gz)` → 主进程 `protocol.handle('app')` 读取 `resources/models/*.tar.gz` 流式返回 → WASM 解码 → 结果回填 UI
- **安全配置**：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: false`

---

## 4. 目录 / 文件意义

### 根目录

| 路径 | 意义 |
|---|---|
| `package.json` | 版本号、脚本、依赖。**版本号在这里改**。脚本：`dev`=开发、`build`=编译产物、`package`=electron-builder 打包 |
| `electron-builder.yml` | 打包配置：`appId: com.seeree.desktop`、`productName: Seeree`、输出到 `release/`、**`extraResources` 把 `models/*.tar.gz` 和 `assets/` 打进 `resources/`**、`files` 排除模型和已被内联的 `vosk-browser`/`uuid`、win 目标为 nsis + portable（x64） |
| `electron.vite.config.ts` | electron-vite 构建配置（main/preload/renderer 三段） |
| `tsconfig.json` / `tsconfig.node.json` / `tsconfig.web.json` | TS 工程配置 |
| `start.bat` | 开发启动脚本：先杀旧 electron 进程 → 检查 node_modules → `npm run dev` |
| `README.md` | 项目说明 |
| `.codebuddy/` | **项目数据，禁止删除** |

### electron/（主进程）

| 路径 | 意义 |
|---|---|
| `electron/main.ts` | 全部主进程逻辑。**关键点见第 5 节注意事项** |
| `electron/preload.ts` | `contextBridge.exposeInMainWorld('electronAPI', ...)`，暴露 IPC 调用：hideWindow / openSettings / closeSettings / moveWindow / resizeForSettings / resizeForBubble / testConnection / listOllamaModels / chatCompletion 等 |

### src/renderer/（渲染进程）

| 路径 | 意义 |
|---|---|
| `main.tsx` | React 入口 |
| `App.tsx` | 根组件，气泡与设置面板路由/切换逻辑 |
| `index.html` / `index.css` / `env.d.ts` | 页面骨架 / 全局样式 / 类型声明 |
| `components/GlassBubble.tsx` | 主悬浮气泡（玻璃质感，点击唤起识别/对话） |
| `components/LiquidBubble.tsx` | 液态玻璃动画气泡（three.js 材质） |
| `components/SiriWave.tsx` | 麦克风波形反馈动画 |
| `components/ControlPanel.tsx` | 设置面板（AI Provider 配置、模型选择、API Key、连接测试） |
| `components/useMicrophone.ts` | 麦克风获取封装（`getUserMedia`） |
| `components/useVoskRecognition.ts` | **vosk 本地识别核心 hook**：加载模型、识别、状态机（"正在聆听"→结果→"不可用"回退逻辑都在这） |
| `hooks/useAIConfig.ts` | AI 配置持久化（localStorage） |
| `hooks/useSpeechRecognition.ts` | 语音识别高层状态机（整合 vosk 与 Web Speech 回退） |
| `shaders/` | GLSL shader 文件（气泡/液体效果） |

### 数据 / 资源 / 产物

| 路径 | 意义 |
|---|---|
| `models/` | **语音模型 tar.gz 目录（源）**：`vosk-model-small-cn-0.3.tar.gz`(31.6MB) + `vosk-model-small-en-us-0.15.tar.gz`(39.3MB)。打包时经 extraResources 进 `resources/models/` |
| `assets/` | 资源：`tray-icon.png`（托盘图标 + 打包图标） |
| `out/` | electron-vite 构建产物（main/preload/renderer），打包时打进 asar |
| `release/` | **electron-builder 打包输出**：`Seeree-portable-0.0.1-beta4.exe`(149.6MB) + `seeree-windows-Setup-0.0.1-beta4.exe`(149.8MB) |
| `release-new/` | **2026-08-23 打包实际输出目录**（因 release/win-unpacked 的 app.asar 被系统进程锁定无法清空，用 `--config.directories.output=release-new` 绕过） |
| `win-SiriAI/` | **分发文件夹**：正式交付的 exe 放这里，命名 `Seeree-v0.0.1betaN.exe`（当前 beta4 = 149.6MB 修复版） |
| `docs/` | PRD.md / TASK.md / TDD.md / **本文件 SEEREE_OVERVIEW.md** |

---

## 5. 注意事项（踩坑记录，务必遵守）

1. **模型选择（最高优先级）**
   - ✅ 用：`vosk-model-small-cn-0.3`（中文，tar.gz 31.6MB）+ `vosk-model-small-en-us-0.15`（英文，tar.gz 39.3MB）
   - ❌ 禁用：`vosk-model-cn-0.22`（2GB 大模型）——已删除。曾导致打包包 1.4GB，用户明确拒绝
   - 打包后整体体积 ~150MB，目标红线 ≤1GB

2. **模型 tar.gz 结构要求**
   - vosk-browser 解包时会 **strip 首层目录**，但**多根目录不剥**
   - 打包前模型必须是 `am/conf/graph/ivector` 结构（即 tar 根目录下直接是 am/conf/graph/ivector 这几个子目录）
   - 如果从 vosk 官方 tar.gz 转换，需要重打包使其符合此结构，否则模型加载失败

3. **`app://` 协议配置（模型加载命脉）**
   - 必须注册为 privileged scheme：`standard + secure + supportFetchAPI + corsEnabled`，否则 `fetch('app://...')` 失败
   - `protocol.handle('app')` 中 `.tar.gz` 必须显式返回 `Content-Type: application/gzip` + `Content-Length`（vosk-browser 需要下载归档），其余走 `net.fetch(file://)`
   - 模型路径：dev = `项目根/models`，prod = `process.resourcesPath/models`（来自 extraResources）

4. **`delete process.env.NODE_OPTIONS`（main.ts 第一行）**
   - 必须保留！IDE/外部注入的 NODE_OPTIONS（如 --require shim）会导致打包版 Chromium 网络服务进程崩溃，进而模型加载/AI 请求全部失败——这是"提示不可用"的经典根因之一

5. **语音"不可用"排查链**
   - vosk 加载失败 → 回退 Web Speech API → 离线环境 Web Speech 必然报"不可用"
   - 排查顺序：① 模型 tar.gz 是否在 `resources/models` 且结构正确 ② `app://` fetch 是否通（看 Network/Console）③ NODE_OPTIONS 是否被删 ④ 麦克风权限
   - **每次打包后必须实测语音识别，不能只测进程能启动**

6. **麦克风权限**
   - 主进程已配 `setPermissionRequestHandler` + `setPermissionCheckHandler`（media 全部放行）+ Windows/macOS `systemPreferences` 请求
   - dev 模式还需 `unsafely-treat-insecure-origin-as-secure` 指向 `http://localhost:5173`，否则 getUserMedia 被拦

7. **electron-builder 体积控制**
   - `files` 中 `!models/**` + `!node_modules/vosk-browser/**` + `!node_modules/uuid/**`：vosk-browser 与 uuid 已被 vite 内联进 renderer bundle，不能再重复打包，否则体积翻倍
   - 模型只通过 `extraResources` 打 `*.tar.gz` 进 resources

8. **AI Provider 细节**
   - OpenAI 模型映射表：`GPT-5→gpt-4o`、`GPT-4o→gpt-4o`、`GPT-4-turbo→gpt-4-turbo`、`GPT-3.5-turbo→gpt-3.5-turbo`
   - Ollama 默认 `http://localhost:11434`，UI 可列本地模型列表
   - Custom = OpenAI 兼容端点（可指向 LM Studio 等本地服务）
   - API Key 只存渲染进程 localStorage（注意：明文，量产前需评估）

9. **窗口与交互**
   - 气泡窗口 360×216、右上角贴边（x = 屏幕宽-370, y=30）、透明无边框、置顶
   - 设置面板 480×560、独立窗口、置顶、无边框
   - 全局快捷键 **Alt+Space** 显示/隐藏
   - 托盘：显示/隐藏 + 退出

10. **版本与分发（用户明确要求）**
    - 分发 exe 放 `win-SiriAI/`，命名 `Seeree-v0.0.1betaN.exe`
    - **新版本在现有最高 beta 序号上递增**（beta4→beta5），不做整数版本递增
    - 特殊情形（2026-08-23）：用户要求"本次不创建新版本号，替换原先的 beta4"——即把修复版直接覆盖 `win-SiriAI/Seeree-v0.0.1beta4.exe`（已执行：1397.6MB 旧大模型版 → 149.6MB 新版）
    - 改版本号：改 `package.json` 的 `version`，然后 `npm run build && npm run package`

11. **构建 / 打包命令**
    - 开发：`start.bat` 或 `npm run dev`
    - 编译：`npm run build`（产物进 `out/`）
    - 打包：`npm run package`（产物进 `release/`）
    - 分发：把 `release/Seeree-portable-...` 复制到 `win-SiriAI/Seeree-v0.0.1betaN.exe`

12. **其他**
    - 主进程 AI 请求全部走 IPC（chatCompletion / testConnection / listOllamaModels），渲染进程不直连网络
    - `move-window` IPC 自动识别当前活跃窗口（设置窗口优先）
    - 退出逻辑：`window-all-closed` 非 mac 直接 quit，托盘提供退出入口

---

## 6. 标准发布流程（SOP）

1. 改代码 → `npm run build`（确认无 TS/lint 错误）
2. **dev 模式实测语音识别**（麦克风可用、识别有文本）
3. `npm run package` → 检查 `release/` 产物
4. 在打包版上**实测语音识别 + AI 对话**（这是最常翻车的环节）
5. 按命名规则复制到 `win-SiriAI/Seeree-v0.0.1betaN.exe`（递增 beta，除非用户明确要求替换）
6. 更新本文件（版本号、阶段、注意事项）

---

## 7. 相关记忆（AI 需知晓）

- 项目历史名：SiriAI（早期）、Seeree（现名）
- 制作者 Ricky；UI 品牌 Seeree；exe CompanyName = Ricky
- 历史版本轨迹：beta1(113.8MB) → beta2(113.9MB) → beta3(113.9MB) → beta4(1397.6MB 大模型版，已弃) → beta4(149.6MB vosk 多语言版，已弃/已删) → **beta4(120.8MB 回退 beta3+修复版，当前，2026-08-23 22:43 打包)**（严格还原 beta3 单中文 cn-0.22 + 延迟修复 partialresult/静音1s/缓冲2048 + 双回答修复 AbortController）
