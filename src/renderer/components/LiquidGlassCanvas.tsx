import { useEffect, useRef, useState } from 'react'
import vertSrc from '../shaders/glass.vert?raw'
import fragSrc from '../shaders/glass.frag?raw'

/* ═══════════════════════════════════════════════════
   LiquidGlassCanvas — WebGL 玻璃着色器
   管线：SDF → bevel → normal → Snell 折射
        → RGB 色散 → Fresnel → rim → tint
   ═══════════════════════════════════════════════════ */

interface LiquidGlassProps {
  width: number
  height: number
  radius?: number
  tintAmount?: number
  tintR?: number
  tintG?: number
  tintB?: number
  saturation?: number
}

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('[LiquidGlass] shader compile error:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function createProgram(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram | null {
  const v = compileShader(gl, gl.VERTEX_SHADER, vs)
  const f = compileShader(gl, gl.FRAGMENT_SHADER, fs)
  if (!v || !f) return null
  const prog = gl.createProgram()
  if (!prog) return null
  gl.attachShader(prog, v)
  gl.attachShader(prog, f)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('[LiquidGlass] program link error:', gl.getProgramInfoLog(prog))
    return null
  }
  return prog
}

export default function LiquidGlassCanvas({
  width,
  height,
  radius = 14,
  tintAmount = 0.10,
  tintR = 1, tintG = 1, tintB = 1,
  saturation = 1.12,
}: LiquidGlassProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef(0)
  const [webglFailed, setWebglFailed] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: true,
    })
    if (!gl) {
      setWebglFailed(true)
      return
    }

    const prog = createProgram(gl, vertSrc, fragSrc)
    if (!prog) {
      setWebglFailed(true)
      return
    }

    gl.useProgram(prog)

    // ── 全屏 quad ──
    const verts = new Float32Array([
      -1, -1,  0, 0,
       1, -1,  1, 0,
      -1,  1,  0, 1,
       1,  1,  1, 1,
    ])
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW)

    const aPos = gl.getAttribLocation(prog, 'aPosition')
    const aUV = gl.getAttribLocation(prog, 'aTexCoord')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0)
    gl.enableVertexAttribArray(aUV)
    gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 16, 8)

    // ── Uniform locations ──
    const u = {
      resolution: gl.getUniformLocation(prog, 'uResolution'),
      tintAmount: gl.getUniformLocation(prog, 'uTintAmount'),
      tint: gl.getUniformLocation(prog, 'uTint'),
      saturation: gl.getUniformLocation(prog, 'uSaturation'),
      radius: gl.getUniformLocation(prog, 'uRadius'),
      size: gl.getUniformLocation(prog, 'uSize'),
    }

    // ── Draw（shader 自行生成颜色，无需纹理） ──
    const glCtx = gl
    const cv = canvas
    function draw() {
      const dpr = window.devicePixelRatio || 1
      const w = width * dpr
      const h = height * dpr
      if (cv.width !== w || cv.height !== h) {
        cv.width = w
        cv.height = h
      }
      glCtx.viewport(0, 0, w, h)
      glCtx.clearColor(0, 0, 0, 0)
      glCtx.clear(glCtx.COLOR_BUFFER_BIT)

      glCtx.uniform2f(u.resolution, w, h)
      glCtx.uniform1f(u.tintAmount, tintAmount)
      glCtx.uniform3f(u.tint, tintR, tintG, tintB)
      glCtx.uniform1f(u.saturation, saturation)
      glCtx.uniform1f(u.radius, radius * dpr)
      glCtx.uniform2f(u.size, w, h)

      glCtx.drawArrays(glCtx.TRIANGLE_STRIP, 0, 4)
    }

    draw()
    // 一次绘制即可（静态 UI，文档 §22: "capture once"）
    // 如需动画背景，可在此加 requestAnimationFrame 循环

    return () => {
      cancelAnimationFrame(animRef.current)
      gl.deleteProgram(prog)
      gl.deleteBuffer(buf)
    }
  }, [width, height, radius, tintAmount, tintR, tintG, tintB, saturation])

  if (webglFailed) return null

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        borderRadius: 'inherit',
      }}
    />
  )
}
