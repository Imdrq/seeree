import { useState, useCallback } from 'react'
import GlassBubble from './components/GlassBubble'
import ControlPanel from './components/ControlPanel'

export default function App(): JSX.Element {
  const [showSettings, setShowSettings] = useState(false)

  const openSettings = useCallback(async () => {
    await window.electronAPI?.resizeForSettings()
    setShowSettings(true)
  }, [])

  const closeSettings = useCallback(async () => {
    setShowSettings(false)
    await window.electronAPI?.resizeForBubble()
  }, [])

  if (showSettings) {
    return <ControlPanel onClose={closeSettings} />
  }

  return <GlassBubble onOpenSettings={openSettings} />
}
