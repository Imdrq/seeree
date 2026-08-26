import { useRef, useMemo, useEffect, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import fragShader from '../shaders/glass.frag?raw'
import vertShader from '../shaders/glass.vert?raw'

/* ================================================
   3D 液态玻璃气泡 — 核心着色器
   ================================================ */

function BubbleSphere(): JSX.Element {
  const meshRef = useRef<THREE.Mesh>(null!)
  const bgTexRef = useRef<THREE.CanvasTexture | null>(null)
  const mouseRef = useRef({ x: 0, y: 0 })
  const { size } = useThree()

  // Shader uniforms
  const uniforms = useMemo(
    () => ({
      uBackground: { value: null as THREE.Texture | null },
      uTime: { value: 0 },
      uBreath: { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uIor: { value: 1.08 },
      uBlurRadius: { value: 0.008 },
      uFresnelPower: { value: 3.2 },
      uChromaStrength: { value: 0.25 }
    }),
    []
  )

  // 捕获桌面背景作为纹理
  const captureBg = useCallback(async () => {
    if (!window.electronAPI?.captureDesktop) return
    try {
      const dataUrl = await window.electronAPI.captureDesktop()
      if (!dataUrl) return
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        const tex = new THREE.CanvasTexture(canvas)
        tex.minFilter = THREE.LinearFilter
        tex.magFilter = THREE.LinearFilter
        tex.colorSpace = THREE.SRGBColorSpace
        bgTexRef.current?.dispose()
        bgTexRef.current = tex
        uniforms.uBackground.value = tex
      }
      img.src = dataUrl
    } catch {
      // 捕获失败则使用纯色背景
    }
  }, [uniforms])

  // 初始捕获 + 定期刷新
  useEffect(() => {
    captureBg()
    const interval = setInterval(captureBg, 800)
    return () => clearInterval(interval)
  }, [captureBg])

  // 鼠标跟踪
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseRef.current.x = (e.clientX / size.width) * 2 - 1
      mouseRef.current.y = -(e.clientY / size.height) * 2 + 1
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [size])

  // 渲染循环
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    uniforms.uTime.value = t
    // 呼吸动画 (3.5s 周期)
    uniforms.uBreath.value = Math.sin(t * 1.8) * 0.5 + 0.5

    // 鼠标平滑跟随
    const mx = mouseRef.current.x
    const my = mouseRef.current.y
    uniforms.uMouse.value.x += (mx - uniforms.uMouse.value.x) * 0.05
    uniforms.uMouse.value.y += (my - uniforms.uMouse.value.y) * 0.05

    // 微缩放呼吸
    const breathScale = 1 + Math.sin(t * 1.8) * 0.03
    meshRef.current.scale.setScalar(breathScale)

    // 微倾斜跟随鼠标
    meshRef.current.rotation.y +=
      (uniforms.uMouse.value.x * 0.15 - meshRef.current.rotation.y) * 0.05
    meshRef.current.rotation.x +=
      (uniforms.uMouse.value.y * 0.1 - meshRef.current.rotation.x) * 0.05
  })

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 128, 128]} />
      <shaderMaterial
        vertexShader={vertShader}
        fragmentShader={fragShader}
        uniforms={uniforms}
        transparent={true}
        depthWrite={false}
      />
    </mesh>
  )
}

/* ================================================
   Canvas 容器
   ================================================ */

export default function LiquidBubble(): JSX.Element {
  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: 'transparent',
        cursor: 'pointer',
        WebkitAppRegion: 'no-drag'
      }}
    >
      <Canvas
        camera={{
          position: [0, 0, 2.2],
          fov: 35,
          near: 0.1,
          far: 100
        }}
        gl={{
          alpha: true,
          premultipliedAlpha: false,
          antialias: true,
          powerPreference: 'high-performance'
        }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.4} />
        <pointLight position={[2, 3, 2]} intensity={0.6} />
        <BubbleSphere />
      </Canvas>
    </div>
  )
}
