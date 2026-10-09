import { useState, useCallback, useEffect } from 'react'
import GlassBubble from './components/GlassBubble'
import ControlPanel from './components/ControlPanel'
import Onboarding, { isOnboardingDone } from './components/Onboarding'

export default function App(): JSX.Element {
  const [showSettings, setShowSettings] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(() => !isOnboardingDone())

  // 启动时按当前模式校准窗口：引导/设置用大窗口，气泡用紧凑窗口
  useEffect(() => {
    if (showOnboarding) {
      window.electronAPI?.resizeForOnboarding()
    } else {
      window.electronAPI?.resizeForBubble()
    }
    // 仅挂载时执行一次
  }, [])

  const openSettings = useCallback(async () => {
    await window.electronAPI?.resizeForSettings()
    setShowSettings(true)
  }, [])

  const closeSettings = useCallback(async () => {
    setShowSettings(false)
    await window.electronAPI?.resizeForBubble()
  }, [])

  const finishOnboarding = useCallback(async () => {
    setShowOnboarding(false)
    await window.electronAPI?.resizeForBubble()
  }, [])

  if (showOnboarding) {
    return <Onboarding onDone={finishOnboarding} />
  }

  if (showSettings) {
    return <ControlPanel onClose={closeSettings} />
  }

  return <GlassBubble onOpenSettings={openSettings} />
}
