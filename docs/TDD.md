# TDD — SiriAI for Windows

> 技术设计文档 | 版本 v1.0 | 2026-07-21

---

## 1. 技术架构总览

### 1.1 架构图

```
┌─────────────────────────────────────────────────────────┐
│                    Electron Main Process                │
│                                                         │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ Tray     │  │ Window Mgr   │  │ Global Shortcut  │ │
│  │ Manager  │  │ (透明窗口)    │  │ (Alt+Space)      │ │
│  └──────────┘  └──────┬───────┘  └──────────────────┘ │
│                       │ IPC                             │
│  ┌────────────────────┼────────────────────────────────┤ │
│  │ Preload (contextBridge)                              │ │
│  │  - window control (show/hide/minimize)               │ │
│  │  - desktop capture (屏幕截图 for 背景采样)            │ │
│  │  - system info (暗色模式检测)                        │ │
│  └────────────────────┼────────────────────────────────┤ │
└───────────────────────┼─────────────────────────────────┘
                        │
┌───────────────────────┼─────────────────────────────────┐
│              Electron Renderer Process                   │
│                                                         │
│  ┌────────────────────┴───────────────────────────────┐ │
│  │                   React 18 App                      │ │
│  │                                                     │ │
│  │  ┌─────────────┐  ┌──────────────┐  ┌───────────┐ │ │
│  │  │ Zustand     │  │ framer-motion│  │ React     │ │ │
│  │  │ Store       │  │ (layout anim)│  │ Three     │ │ │
│  │  └──────┬──────┘  └──────┬───────┘  │ Fiber     │ │ │
│  │         │                │           └─────┬─────┘ │ │
│  │         │                │                 │       │ │
│  │  ┌──────┴────────────────┴─────────────────┴─────┐ │ │
│  │  │              Components                       │ │ │
│  │  │                                              │ │ │
│  │  │  LiquidBubble ←→ DynamicIsland ←→ ChatPanel  │ │ │
│  │  │        │               │              │       │ │ │
│  │  │        └───────┬───────┘              │       │ │ │
│  │  │                │                      │       │ │ │
│  │  │         Waveform (Web Audio)          │       │ │ │
│  │  └──────────────────────────────────────┘       │ │ │
│  └─────────────────────────────────────────────────┘ │ │
│                                                       │ │
│  ┌───────────────────────────────────────────────────┐ │
│  │                  Services Layer                    │ │
│  │                                                   │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │ │
│  │  │ OpenAI   │ │ Web      │ │ Web Speech API   │ │ │
│  │  │ SDK (SSE)│ │ Audio API│ │ (SpeechRecog)    │ │ │
│  │  └──────────┘ └──────────┘ └──────────────────┘ │ │
│  └───────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────┘
```

### 1.2 技术选型理由

| 选型 | 理由 |
|------|------|
| **Electron** | 原生透明窗口支持；Chromium 的 WebGL/Web Audio/backdrop-filter 能力；丰富的桌面 API |
| **React 18** | 生态成熟，framer-motion + React Three Fiber 深度绑定 React |
| **TypeScript** | 类型安全，降低大型项目的维护成本 |
| **Three.js + R3F** | 3D 渲染液态玻璃气泡，GLSL Shader 实现折射/色散 |
| **framer-motion** | `layoutId` 天然适合气泡 ↔ 胶囊形态切换；spring 动画曲线 |
| **Zustand** | 比 Redux 轻量；比 Context 性能好；天然支持 selector 防重渲染 |
| **Vite** | 极速 HMR；electron-vite 统一主进程/渲染进程构建 |
| **Tailwind CSS** | 原子化样式，快速 UI 开发；JIT 编译零运行时开销 |

---

## 2. 核心模块设计

### 2.1 窗口管理模块

**文件：** `electron/windowManager.ts`

```
窗口层级：
┌─────────────────────────────────────┐
│  Layer 3: Overlay Window            │  ← 透明全屏遮罩（可选）
│  (click-through except bubble area) │
├─────────────────────────────────────┤
│  Layer 2: Main Bubble Window        │  ← 主气泡窗口
│  (transparent, alwaysOnTop,        │
│   resizable for expand/collapse)    │
├─────────────────────────────────────┤
│  Layer 1: Desktop                   │
└─────────────────────────────────────┘
```

**窗口配置：**

| 属性 | 值 |
|------|-----|
| `transparent` | `true` |
| `frame` | `false` |
| `alwaysOnTop` | `true` |
| `resizable` | `true`（展开时需要） |
| `skipTaskbar` | `true` |
| `hasShadow` | `false` |
| `type` | `toolbar`（不抢夺焦点） |

**窗口尺寸状态：**

| 状态 | 宽度 | 高度 |
|------|------|------|
| IDLE（气泡） | 140px | 140px |
| ACTIVE（胶囊） | 300px | 90px |
| EXPANDED（面板） | 400px | 580px |

**位置策略：**
- 默认：屏幕右上角，距右边缘 20px，距顶部 60px
- 保留用户拖拽后的位置到 `localStorage`
- 多显示器：跟随当前鼠标所在屏幕

**点击穿透处理：**
- 使用 `setIgnoreMouseEvents(true, { forward: true })` 让非气泡区域点击穿透
- 气泡/胶囊/面板区域注册鼠标事件区域，该区域内 `setIgnoreMouseEvents(false)`
- 用透明 `div` 占位实现精确的点击区域映射

### 2.2 液态玻璃气泡渲染模块

**文件：** `src/components/LiquidBubble/`

**技术方案：** Three.js + React Three Fiber + 自定义 GLSL Shader

#### 2.2.1 3D 场景结构

```
Scene
├── Camera (Orthographic, 正对 XY 平面)
├── Ambient Light
├── Point Light (动态位置，跟随鼠标)
└── Mesh (SphereGeometry, 细分 128 段)
    └── ShaderMaterial
        ├── Vertex Shader (glass.vert)
        │   - 传递 position, normal, uv 到片元着色器
        │   - 鼠标交互：顶点微位移
        └── Fragment Shader (glass.frag)
            - 背景纹理采样（desktopCapturer 截图）
            - UV 偏移（基于法线方向，模拟折射）
            - 高斯模糊采样（多次偏移采样平均）
            - 菲涅尔反射（Fresnel = pow(1 - dot(N, V), 3)）
            - RGB 通道分离偏移（chromatic aberration）
            - 边缘高光叠加
```

#### 2.2.2 着色器伪代码

```glsl
// glass.frag 核心逻辑伪代码

uniform sampler2D uBackground;   // 桌面壁纸纹理
uniform vec2 uMouse;             // 鼠标归一化位置
uniform float uTime;             // 时间
uniform float uBreath;           // 呼吸动画进度

void main() {
    // 1. 计算折射偏移
    vec3 viewDir = normalize(vec3(0, 0, 1)); // 正交相机，视线沿 Z
    float fresnel = pow(1.0 - abs(dot(vNormal, viewDir)), 3.0);
    vec2 refractOffset = vNormal.xy * 0.02 * (1.0 + fresnel);

    // 2. 背景采样 + 模糊
    vec2 sampleUV = vUv + refractOffset;
    vec4 bgColor = texture2D(uBackground, sampleUV);
    // 多次偏移采样做高斯模糊近似
    bgColor += texture2D(uBackground, sampleUV + vec2(0.01, 0));
    bgColor += texture2D(uBackground, sampleUV + vec2(-0.01, 0));
    bgColor += texture2D(uBackground, sampleUV + vec2(0, 0.01));
    bgColor += texture2D(uBackground, sampleUV + vec2(0, -0.01));
    bgColor /= 5.0;

    // 3. RGB 色散
    float r = texture2D(uBackground, sampleUV + refractOffset * 1.5).r;
    float g = texture2D(uBackground, sampleUV + refractOffset).g;
    float b = texture2D(uBackground, sampleUV + refractOffset * 0.5).b;
    vec4 chromaColor = vec4(r, g, b, 1.0);

    // 4. 混合
    vec4 glassColor = mix(chromaColor, bgColor, 0.5);

    // 5. 菲涅尔边缘高光
    float edgeGlow = fresnel * 0.6 + 0.1;
    glassColor.rgb += vec3(0.3, 0.5, 1.0) * fresnel * 0.15;

    // 6. 呼吸动画叠加
    float breath = uBreath * 0.05;
    glassColor.rgb += breath;

    gl_FragColor = vec4(glassColor.rgb, 0.85);
}
```

#### 2.2.3 桌面背景捕获

```typescript
// electron/main.ts 中
import { desktopCapturer } from 'electron';

ipcMain.handle('capture-desktop', async () => {
    const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 512, height: 512 }
    });
    return sources[0].thumbnail.toDataURL();
});
```

- 每 500ms 捕获一次桌面缩略图（低频率，减少开销）
- 将 `dataURL` 转换为 `THREE.CanvasTexture` 传入 Unity
- 仅在窗口可见时捕获

#### 2.2.4 动画循环（rAF）

```typescript
// 渲染循环管理
const useRenderLoop = (callback: (time: number) => void) => {
    const ref = useRef<number>();

    useEffect(() => {
        const loop = (time: number) => {
            callback(time);
            ref.current = requestAnimationFrame(loop);
        };
        ref.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(ref.current!);
    }, [callback]);
};
```

- 窗口不可见时暂停 rAF
- 使用 `useFrame` (R3F) 管理 Three.js 渲染循环

### 2.3 Dynamic Island 模块

**文件：** `src/components/DynamicIsland/`

**核心技术：** framer-motion `layoutId` + `AnimatePresence`

#### 2.3.1 动画流程

```
IDLE → ACTIVE:
  1. 窗口从 140×140 变为 300×90
  2. 气泡从圆形拉伸为胶囊形
  3. 3D 球体 mesh 跟随窗口变形（scale 动画）
  4. 波形条容器从透明度 0 → 1 淡入

ACTIVE → EXPANDED:
  1. 窗口从 300×90 变为 400×580
  2. 胶囊保持顶部固定
  3. 对话面板从胶囊底部向下滑出
  4. 面板内容淡入

EXPANDED → ACTIVE:
  1. 反向动画
```

#### 2.3.2 尺寸动画实现

```typescript
// 通过 IPC 通知主进程改变窗口尺寸
const resizeWindow = async (state: WindowState) => {
    const sizes = {
        idle:    { width: 140, height: 140 },
        active:  { width: 300, height: 90  },
        expanded:{ width: 400, height: 580 },
    };
    await window.electronAPI.setWindowSize(sizes[state]);
};
```

- 主进程 `BrowserWindow.setBounds()` 带动画（`animate: true`）
- 渲染进程用 framer-motion 同步做内容动画
- 两个动画曲线保持一致（spring, stiffness: 170, damping: 26）

### 2.4 波形动画模块

**文件：** `src/components/Waveform/`

**技术栈：** Web Audio API → Canvas 2D / Three.js Particles

#### 2.4.1 音频捕获管线

```
麦克风 → MediaStream → AudioContext.createMediaStreamSource()
    ├── AnalyserNode (频谱分析)
    │   └── getByteFrequencyData() → 柱状频谱数据
    └── AnalyserNode (音量分析)
        └── getByteTimeDomainData() → 波形数据 / RMS 音量
```

#### 2.4.2 波形渲染方案

**方案 A：胶囊内柱状频谱（默认）**
- Canvas 2D 绘制
- 3-5 根竖条，高度随频谱变化
- 圆角矩形，渐变色填充
- 60 FPS 更新

**方案 B：环形粒子波形（更多视觉冲击）**
- Three.js Points / InstancedMesh
- 64 个粒子均匀分布在椭圆环上
- 粒子位置半径 = 基础半径 + 频谱值 × 振幅系数
- 粒子颜色从蓝色渐变到紫色

**方案 C：气泡表面波形**
- 将频谱数据传入 Shader uniform
- 在片元着色器中叠加法线扰动
- 气泡看起来随着说话"振动"

#### 2.4.3 音频权限

```typescript
const startCapture = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    return { analyser, stream };
};
```

### 2.5 ChatGPT 集成模块

**文件：** `src/services/openai.ts`

#### 2.5.1 API 调用方案

```typescript
interface ChatConfig {
    model: 'gpt-4o' | 'gpt-4o-mini';
    apiKey: string;
    baseURL?: string;  // 支持自定义代理
    maxTokens: number;
    temperature: number;
}

// SSE 流式调用
const streamChat = async (
    messages: ChatMessage[],
    onToken: (token: string) => void,
    onDone: () => void,
    onError: (err: Error) => void
) => {
    const response = await fetch(`${baseURL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages,
            stream: true,
            max_tokens: maxTokens,
            temperature,
        }),
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
        const { done, value } = await reader.read();
        if (done) { onDone(); break; }
        const chunk = decoder.decode(value);
        // 解析 SSE "data: {...}" 格式
        for (const line of chunk.split('\n')) {
            if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') { onDone(); return; }
                const parsed = JSON.parse(data);
                const token = parsed.choices[0]?.delta?.content;
                if (token) onToken(token);
            }
        }
    }
};
```

#### 2.5.2 错误处理策略

| 错误类型 | 处理方式 |
|----------|----------|
| 网络错误 | 指数退避重试（1s → 2s → 4s），最多 3 次 |
| 401 Unauthorized | 提示用户检查 API Key |
| 429 Rate Limit | 等待 Retry-After 头指示的时间 |
| 5xx Server Error | 提示稍后重试 |

#### 2.5.3 上下文管理

```typescript
interface ConversationState {
    messages: ChatMessage[];       // 当前会话所有消息
    maxContextTokens: number;      // 最大上下文 token 数 (4096)
    systemPrompt: string;          // 系统提示词
}

// 超长上下文自动裁剪：保留 system prompt + 最近 N 轮对话
const trimContext = (state: ConversationState): ChatMessage[] => {
    // 粗略估算: 1 token ≈ 4 字符
    let totalChars = 0;
    const result: ChatMessage[] = [state.messages[0]]; // system prompt
    totalChars += state.messages[0].content.length;

    for (let i = state.messages.length - 1; i > 0; i--) {
        const msg = state.messages[i];
        const estimatedTokens = (totalChars + msg.content.length) / 4;
        if (estimatedTokens > state.maxContextTokens) break;
        result.splice(1, 0, msg);
        totalChars += msg.content.length;
    }
    return result;
};
```

### 2.6 语音识别模块

**文件：** `src/services/speechRecognition.ts`

**方案：Web Speech API（浏览器内置）**

```typescript
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const startRecognition = (onResult: (text: string) => void) => {
    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';       // 支持中英文
    recognition.interimResults = true; // 实时中间结果
    recognition.continuous = true;     // 持续识别

    recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
            .map(r => r[0].transcript)
            .join('');
        onResult(transcript);
    };

    recognition.start();
    return recognition;
};
```

**Windows 限制说明：**
- Chromium 使用系统语音识别引擎
- Windows 11 内置中文语音识别（需联网）
- 准确率依赖系统语音包质量
- 备选方案：Azure Speech SDK（更高准确率，需额外配置）

### 2.7 状态管理

**文件：** `src/store/appStore.ts`

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
    // 窗口状态
    windowState: 'hidden' | 'idle' | 'active' | 'expanded';
    setWindowState: (s: AppState['windowState']) => void;

    // 音频状态
    isListening: boolean;
    audioLevel: number;          // 0-1 音量
    frequencyData: Uint8Array;   // 频谱数据

    // 对话状态
    conversations: Conversation[];
    activeConversationId: string | null;
    isStreaming: boolean;        // 是否正在接收流式响应

    // 设置
    settings: Settings;

    // 动作
    startListening: () => void;
    stopListening: () => void;
    sendMessage: (text: string) => Promise<void>;
    newConversation: () => void;
}

export const useAppStore = create<AppState>()(
    persist(
        (set, get) => ({
            // ... 状态与动作实现
        }),
        {
            name: 'siriai-store',
            partialize: (state) => ({
                // 仅持久化对话历史和设置
                conversations: state.conversations,
                settings: state.settings,
            }),
        }
    )
);
```

---

## 3. 数据流

### 3.1 用户输入 → AI 回复 全链路

```
用户语音 / 文字输入
        │
        ▼
┌─────────────────┐
│  SpeechRecog    │  Web Speech API → 文字
│  or Input Box   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Zustand Store  │  addMessage(role: 'user', text)
│  (chatStore)    │  isStreaming = true
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  OpenAI Service │  POST /v1/chat/completions
│  (SSE Stream)   │  Authorization: Bearer {apiKey}
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  onToken 回调    │  Zustand: appendToLastMessage(token)
│  (逐 token)     │  React: 打字机效果渲染
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  onDone 回调     │  isStreaming = false
│                 │  持久化对话到 localStorage
└─────────────────┘
```

### 3.2 窗口状态 ↔ 渲染同步

```
Zustand: windowState 变化
        │
        ├──→ Electron IPC: setWindowSize({width, height})
        │         │
        │         └──→ BrowserWindow.setBounds(animate: true)
        │
        └──→ React (framer-motion): layoutId 动画
                  │
                  ├──→ LiquidBubble: scale/opacity
                  ├──→ DynamicIsland: width/height
                  └──→ ChatPanel: mount/unmount
```

### 3.3 音频数据流

```
麦克风 → MediaStream
    │
    ├──→ AnalyserNode (fftSize=256)
    │       │
    │       └──→ getByteFrequencyData()
    │              │
    │              ├──→ rAF 每帧更新 Zustand.frequencyData
    │              └──→ Waveform Canvas/Three.js 重绘
    │
    └──→ AnalyserNode (fftSize=64)
            │
            └──→ getByteTimeDomainData()
                   │
                   └──→ RMS 计算 → Zustand.audioLevel
                          │
                          └──→ Shader: 气泡振动幅度
```

---

## 4. IPC 接口设计

### 4.1 Preload 暴露的 API

```typescript
// electron/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    // 窗口控制
    setWindowSize: (size: { width: number; height: number }) =>
        ipcRenderer.invoke('set-window-size', size),

    setWindowPosition: (pos: { x: number; y: number }) =>
        ipcRenderer.invoke('set-window-position', pos),

    hideWindow: () => ipcRenderer.invoke('hide-window'),

    // 桌面捕获
    captureDesktop: () => ipcRenderer.invoke('capture-desktop'),

    // 系统信息
    isDarkMode: () => ipcRenderer.invoke('is-dark-mode'),

    // 设置
    setAutoStart: (enabled: boolean) =>
        ipcRenderer.invoke('set-auto-start', enabled),

    getPlatform: () => process.platform,
});
```

### 4.2 主进程 IPC Handler

```typescript
// electron/main.ts
ipcMain.handle('set-window-size', async (_, size) => {
    const win = BrowserWindow.getFocusedWindow()!;
    const [currentX, currentY] = win.getPosition();
    win.setBounds({
        x: currentX,
        y: currentY,
        width: size.width,
        height: size.height,
    }, true); // animate: true
});
```

---

## 5. 降级策略

### 5.1 GPU 不支持 WebGL 2.0

检测：`canvas.getContext('webgl2')` 返回 `null`

降级方案：
- 3D 液态玻璃 → CSS `backdrop-filter: blur()` 纯毛玻璃效果
- Three.js 渲染 → Canvas 2D 绘制静态气泡（带渐变）
- 波形动画 → CSS @keyframes 简单动画

### 5.2 麦克风权限被拒绝

- 波形动画使用内置的模拟数据（简单的正弦波 + 随机扰动）
- 语音识别入口置灰，提示用户开启麦克风权限
- 保持文字输入功能可用

### 5.3 无网络

- ChatGPT 调用失败时显示离线提示
- 保留本地历史对话可查看
- 不强制要求网络

---

## 6. 构建与打包

### 6.1 构建工具链

```
开发环境:
  pnpm dev          → electron-vite dev (HMR + Electron 热重载)

生产构建:
  pnpm build        → electron-vite build
  pnpm package      → electron-builder (打包 .exe / MSIX)

输出:
  dist/
  └── SiriAI Setup 1.0.0.exe      (NSIS 安装包)
  └── SiriAI 1.0.0.msix           (MSIX 应用包)
```

### 6.2 electron-builder 配置

```yaml
# electron-builder.yml
appId: com.siriai.desktop
productName: SiriAI
directories:
  output: release

win:
  target:
    - target: nsis
      arch: [x64]
    - target: msix
      arch: [x64]
  icon: resources/icon.ico

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
```

### 6.3 依赖清单

```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "three": "^0.168.0",
    "@react-three/fiber": "^8.17.0",
    "@react-three/drei": "^9.114.0",
    "framer-motion": "^11.5.0",
    "zustand": "^4.5.0",
    "react-markdown": "^9.0.0",
    "react-syntax-highlighter": "^15.5.0"
  },
  "devDependencies": {
    "electron": "^33.0.0",
    "electron-builder": "^25.0.0",
    "electron-vite": "^2.3.0",
    "vite": "^5.4.0",
    "typescript": "^5.6.0",
    "@types/react": "^18.3.0",
    "@types/three": "^0.168.0",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0"
  }
}
```

---

## 7. 安全设计

| 措施 | 说明 |
|------|------|
| `contextIsolation: true` | 渲染进程与主进程隔离 |
| `nodeIntegration: false` | 渲染进程不能直接调用 Node API |
| `sandbox: true` | 渲染进程沙盒化 |
| API Key 加密 | 使用 `safeStorage.encryptString()` 存储 |
| CSP 头 | `Content-Security-Policy` 限制脚本来源 |
| 无远程内容 | 所有资源本地打包，不加载远程脚本 |

---

## 8. 测试策略

| 层级 | 范围 | 工具 |
|------|------|------|
| 单元测试 | 工具函数、Store、Service | Vitest |
| 组件测试 | 独立组件渲染 | React Testing Library |
| E2E | 完整用户交互流程 | Playwright (Electron) |
| 性能测试 | 帧率、内存、CPU | Chrome DevTools Performance |

---

## 9. 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| WebGL 在低端 GPU 上性能不佳 | 中 | 高 | CSS 降级方案，GPU 黑名单 |
| 透明窗口在 Windows 上表现不一致 | 中 | 中 | 多显卡测试，不透明降级 |
| Web Speech API 中文识别不准 | 高 | 中 | 备选 Azure Speech SDK |
| OpenAI API 被墙 | 高 | 高 | 支持自定义代理地址 |
| Electron 包体积过大 | 低 | 中 | 按需加载，tree shaking |
