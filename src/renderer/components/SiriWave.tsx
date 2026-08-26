import { useEffect, useRef, type MutableRefObject } from 'react'

/* ================================================================
   SiriWave v13 — 多层磨砂玻璃色条叠加

   核心理念：
   - 5 条彩色玻璃片，垂直错位叠放
   - source-over 混合 → 重叠处上层颜色覆盖下层，不白
   - 每条单一色调，模拟染色玻璃
   - 梭形包络 + 波节 + 安全范围
   ================================================================ */

function lerp(a: number, b: number, s: number) { return a + (b - a) * s }

// 5 条玻璃色片的色调定义
interface GlassPane { r: number; g: number; b: number; yOff: number; alpha: number; phaseOff: number }
const GLASS_PANES: GlassPane[] = [
  { r: 74,  g: 54,  b: 217, yOff: -2.8, alpha: 0.46, phaseOff: 0.8 },
  { r: 108, g: 86,  b: 255, yOff: -1.3, alpha: 0.42, phaseOff: 1.6 },
  { r: 138, g: 119, b: 255, yOff: 0,    alpha: 0.50, phaseOff: 0.0 },
  { r: 108, g: 86,  b: 255, yOff: 1.3,  alpha: 0.42, phaseOff: 1.2 },
  { r: 10,  g: 173, b: 139, yOff: 2.8,  alpha: 0.44, phaseOff: 0.4 },
]

/** 梭形包络：两端细尖(=0)，中间饱满平均(=1)。 */
function envelope(x01: number): number {
  return Math.pow(Math.sin(Math.PI * x01), 0.7)
}

/** 波节调制：节点随音量移动，低音量显示节点(s1)，高音量显示波峰游走(s2+travel)，
 *  随时间脉动，产生 beta3 的错落游走感。 */
function nodeModulation(x01: number, t: number, vol: number): number {
  const nodeShift = vol * 0.12
  const s1 = Math.sin(Math.PI * 2 * (x01 + nodeShift)) * Math.sin(t * 2.2)
  const s2 = Math.sin(Math.PI * 3 * (x01 + nodeShift * 0.7)) * Math.sin(t * 1.7 + 1.4)
  const travel = Math.sin(Math.PI * 3 * (x01 + t * 0.3) + vol * 1.5) * 0.15
  const r1 = Math.max(0, 1 - vol * 1.5)
  const r2 = Math.min(1, vol * 1.5)
  return s1 * r1 + s2 * r2 + travel * (0.5 + vol * 0.5)
}

/** 绘制一条玻璃色片 */
function drawPane(
  ctx: CanvasRenderingContext2D, w: number, bandY: number,
  volThick: number, vol: number, t: number, steps: number,
  pane: GlassPane, volMulti = 1
) {
  const y = bandY + pane.yOff * (0.5 + volMulti * 0.5)
  const pVol = vol * volMulti
  // 各层用自身相位 phaseOff 错开波节 → 层叠错落感
  const pt = t + pane.phaseOff
  ctx.beginPath()
  for (let i = 0; i <= steps; i++) {
    const x01 = i / steps
    const x = x01 * w
    const env = envelope(x01)
    const node = nodeModulation(x01, pt, pVol)
    const nodeAmp = Math.min(1.2, 0.25 + pVol * 1.1)
    const th = Math.max(volThick * 0.1, volThick * env * (1 + node * nodeAmp))
    const py = y - th
    if (i === 0) ctx.moveTo(x, py)
    else ctx.lineTo(x, py)
  }
  for (let i = steps; i >= 0; i--) {
    const x01 = i / steps
    const x = x01 * w
    const env = envelope(x01)
    const node = nodeModulation(x01, pt, pVol)
    const nodeAmp = Math.min(1.2, 0.25 + pVol * 1.1)
    const th = Math.max(volThick * 0.1, volThick * env * (1 + node * nodeAmp))
    const py = y + th
    ctx.lineTo(x, py)
  }
  ctx.closePath()
  const a = Math.min(1, pane.alpha * (0.35 + pVol * 1.2))
  ctx.fillStyle = `rgba(${pane.r},${pane.g},${pane.b},${a})`
  ctx.fill()
}

/** 胶囊形裁剪 */
function stadiumClip(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const r = h / 2
  ctx.beginPath()
  ctx.moveTo(r, 0)
  ctx.lineTo(w - r, 0)
  ctx.arc(w - r, r, r, -Math.PI / 2, Math.PI / 2)
  ctx.lineTo(r, h)
  ctx.arc(r, r, r, Math.PI / 2, -Math.PI / 2)
  ctx.closePath()
  ctx.clip()
}

interface Props {
  volumeRef: MutableRefObject<number>
  listening: boolean
  speaking?: boolean
  width?: number
  height?: number
}

export default function SiriWave({ volumeRef, listening, speaking = false, width = 320, height = 180 }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null!)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'
    ctx.scale(dpr, dpr)

    let t = 0, smoothVol = 0, raf = 0

    function draw() {
      const w = width, h = height
      const cy = h / 2
      const halfR = h / 2
      const steps = 260

      // AI 播报时用模拟声波驱动，否则用麦克风音量
      let src = 0
      if (speaking) {
        src = 0.32 + 0.34 * Math.abs(Math.sin(t * 8.2)) + 0.18 * Math.abs(Math.sin(t * 22.7 + 1.4))
      } else {
        src = volumeRef.current
      }
      smoothVol = lerp(smoothVol, listening ? src : 0, 0.12)
      const vol = Math.min(1, smoothVol)

      ctx.clearRect(0, 0, w, h)

      /* ===== 参数 ===== */
      const bandY = cy - 2
      const margin = halfR * 0.18
      const maxThick = halfR - margin
      const baseThick = halfR * 0.28
      const volThick = Math.min(maxThick * 0.94, baseThick * (1 + vol * 1.9))

      /* ===== 主色带：5 层玻璃片叠加 (source-over) ===== */
      ctx.save()
      stadiumClip(ctx, w, h)

      for (const pane of GLASS_PANES) {
        drawPane(ctx, w, bandY, volThick, vol, t, steps, pane, 1)
      }

      // 光带高亮描边（上缘发光）
      const { yOff: _, alpha: __, phaseOff: ___, r, g, b } = GLASS_PANES[2] // 中间层色调
      ctx.beginPath()
      const _pt = t
      for (let i = 0; i <= steps; i++) {
        const x01 = i / steps
        const x = x01 * w
        const env = envelope(x01)
        const node = nodeModulation(x01, _pt, vol)
        const nodeAmp = Math.min(1.2, 0.25 + vol * 1.1)
        const th = Math.max(volThick * 0.1, volThick * env * (1 + node * nodeAmp))
        const py = bandY - th
        if (i === 0) ctx.moveTo(x, py)
        else ctx.lineTo(x, py)
      }
      ctx.strokeStyle = `rgba(${r},${g},${b},${0.4 + vol * 0.6})`
      ctx.lineWidth = 1
      ctx.stroke()

      ctx.restore()

      /* ===== 倒影 ===== */
      ctx.save()
      stadiumClip(ctx, w, h)
      ctx.globalAlpha = 0.08 + vol * 0.14
      const reflY = cy + halfR * 0.38
      for (const pane of [...GLASS_PANES].reverse()) {
        const refPane: GlassPane = {
          ...pane,
          yOff: pane.yOff * 0.5,
          alpha: pane.alpha * 0.35,
        }
        drawPane(ctx, w, reflY, volThick * 0.35, vol * 0.6, t * 0.7 + 1.8, steps, refPane, 0.5)
      }
      ctx.globalAlpha = 1
      ctx.restore()

      /* ===== 暗角 ===== */
      ctx.save()
      stadiumClip(ctx, w, h)
      const topGrad = ctx.createLinearGradient(0, 0, 0, halfR * 0.38)
      topGrad.addColorStop(0, 'rgba(0,0,0,0.22)')
      topGrad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = topGrad
      ctx.fillRect(0, 0, w, halfR * 0.38)

      const botGrad = ctx.createLinearGradient(0, h - halfR * 0.42, 0, h)
      botGrad.addColorStop(0, 'rgba(0,0,0,0)')
      botGrad.addColorStop(1, 'rgba(0,0,0,0.26)')
      ctx.fillStyle = botGrad
      ctx.fillRect(0, h - halfR * 0.42, w, halfR * 0.42)
      ctx.restore()

      t += 0.016
      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [width, height, listening, speaking, volumeRef])

  return <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%', pointerEvents: 'none' }} />
}
