import React from 'react'
import { TablerIcon } from '../lib/TablerIcon'

export function WindowControls() {
  const handleMinimize = () => {
    // @ts-ignore
    window.__TAURI__.window.getCurrentWindow().then((w: any) => w.minimize())
  }

  const handleMaximize = () => {
    // @ts-ignore
    window.__TAURI__.window.getCurrentWindow().then((w: any) => {
      w.isMaximized().then((max: boolean) => {
        if (max) w.unmaximize()
        else w.maximize()
      })
    })
  }

  const handleClose = () => {
    // @ts-ignore
    window.__TAURI__.window.getCurrentWindow().then((w: any) => w.close())
  }

  return (
    <div className="window-controls justify-end titlebar-button-group">
      <button
        onClick={handleMinimize}
        className="window-button window-button-yellow"
        title="Minimize"
      >
        <TablerIcon name="pause" size={6} />
      </button>
      <button
        onClick={handleMaximize}
        className="window-button window-button-green"
        title="Maximize"
      >
        <TablerIcon name="refresh" size={6} />
      </button>
      <button
        onClick={handleClose}
        className="window-button window-button-red"
        title="Close"
      >
        <TablerIcon name="x" size={6} />
      </button>
    </div>
  )
}
