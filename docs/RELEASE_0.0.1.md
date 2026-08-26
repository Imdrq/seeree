# Seeree 0.0.1 版本发布说明

## 一、版本信息

- **版本号**：`0.0.1`（已从 `0.0.1beta4` 更新）
- **应用名**：Seeree
- **AppId**：`com.seeree.desktop`
- **打包配置**：`electron-builder.yml`

## 二、当前已完成的改动（相对 beta4）

1. 丝带恢复为 **beta3 原始风格**（`SiriWave.tsx`）：
   - 梭形包络 `envelope(x01) = sin(πx01)^0.7`，两端细尖、中间饱满
   - 波节调制 `nodeModulation`（节点随音量移动、错落游走）
   - 以 `#6C56FF`（紫蓝）为主色调，青绿点缀
2. **T 键按住说话**（`GlassBubble.tsx`）：
   - 按住 T 开始聆听，玻璃球亮度提升 1.5%（`brightness` 0.95 → 0.964）
   - 松开 T 仅恢复亮度，不取消会话
   - 取消只能通过**点击玻璃球**（聆听中点击取消）
   - 提示文案：`按 T 或点击开始`
3. AI 响应期间锁定输入、共用麦克风流等早期修复保留

## 三、Windows 安装包（已生成）

在 `release/` 目录下，已在 Windows 10+ (x64) 上打包完成：

| 文件 | 类型 |
|------|------|
| `seeree-windows-Setup-0.0.1.exe` | 安装版（NSIS，可选安装目录，桌面/开始菜单快捷方式，**可正常卸载**） |
| `Seeree-portable-0.0.1.exe` | 便携版（免安装，删除该 exe 即算卸载） |

> 注意：安装包**未签名**（无代码签名证书），首次运行时系统可能提示“未知发布者”，点“仍要运行”即可。

### 如何卸载 / 删除干净

**安装版（推荐）**：在「设置 → 应用」或「控制面板 → 程序和功能」中找到 **Seeree**，点击卸载即可。
- 已开启 `deleteAppDataOnUninstall: true`，卸载时会**同时删除**应用的用户数据（配置、语音模型缓存、聊天记录等），不会残留。
- 也可直接运行安装目录下的 `Uninstall Seeree.exe`，或在开始菜单右键 Seeree → 卸载。

**便携版**：直接删除 `Seeree-portable-0.0.1.exe` 即可；若已运行过，应用数据在 `%APPDATA%\Seeree`（可一并删除，可选）。

## 四、Mac 安装包（需在 macOS 上打包）

**限制说明**：electron-builder 的 `.dmg` 打包**只能在 macOS 上完成**（dmg 依赖 macOS 的 `hdiutil`，Windows 上无法生成）。因此 Mac 安装包需在一台 Mac 上执行以下命令。

### Mac 打包步骤

1. 把整个项目文件夹拷贝到 Mac（含 `node_modules`、`models/`、`assets/`）。
2. 在项目根目录打开终端，安装依赖（若已拷贝 node_modules 可跳过）：
   ```bash
   npm install
   ```
3. 打包 Mac 版本（同时生成 Intel `x64` 与 Apple Silicon `arm64` 的 dmg）：
   ```bash
   npm run package -- --mac
   ```
   或仅打一种架构：
   ```bash
   # 仅 Apple Silicon
   npx electron-builder --mac --x64
   # 仅 Intel
   npx electron-builder --mac --arm64
   ```
4. 产物输出到 `release/`：
   - `Seeree-0.0.1.dmg`（Intel）
   - `Seeree-0.0.1-arm64.dmg`（Apple Silicon）

### Mac 首次运行注意事项

- **未签名/公证**：应用未做 Apple 签名与公证，首次打开可能提示“无法验证开发者”。
  - 方式一：右键应用 → 打开 → 仍要打开
  - 方式二（临时允许）：
    ```bash
    sudo xattr -rd com.apple.quarantine /Applications/Seeree.app
    ```
- **麦克风权限**：首次使用需在「系统设置 → 隐私与安全性 → 麦克风」中允许 Seeree。
- **语音（TTS）**：使用 macOS 系统语音，确保系统已安装中文语音（系统设置 → 辅助功能 → 朗读内容）。
- **图标**：当前 Mac 图标复用 `assets/tray-icon.png`（256px），清晰度一般；如需高清建议替换为 1024×1024 的 `assets/icon.png` 并更新 `electron-builder.yml`。

## 五、跨平台注意事项（代码已适配）

- 主进程：窗口关闭行为已按 `process.platform !== 'darwin'` 区分，mac 关闭窗口不退出应用。
- 语音识别：使用 `getUserMedia` + vosk-browser 离线模型，跨平台可用。
- 语音播报：使用 Web Speech API（`speechSynthesis`），mac 使用系统语音。
- 若在 Mac 打包后需要签名/公证，需配置 Apple Developer 证书（`CSC_LINK` / `CSC_KEY_PASSWORD`）与 `electron-builder.yml` 中的 `notarize`。

## 六、重新打包 Windows

```bash
npm run build && npx electron-builder --win
```
