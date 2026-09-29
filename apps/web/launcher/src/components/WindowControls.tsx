import { getCurrentWindow } from '@tauri-apps/api/window'
import { TablerIcon } from '../lib/TablerIcon'

/** Native window actions kept outside the draggable title bar area. */
export function WindowControls() {
  const handleMinimize = () => {
    void getCurrentWindow().minimize()
  }

  const handleMaximize = async () => {
    const window = getCurrentWindow()
    if (await window.isMaximized()) {
      await window.unmaximize()
    } else {
      await window.maximize()
    }
  }

  const handleClose = () => {
    void getCurrentWindow().close()
  }

  return (
    <div className="window-controls titlebar-button-group" aria-label="Window controls">
      <button type="button" onClick={handleMinimize} className="window-button" title="Minimize">
        <TablerIcon name="minimize" size={15} />
      </button>
      <button type="button" onClick={() => void handleMaximize()} className="window-button" title="Maximize">
        <TablerIcon name="maximize" size={14} />
      </button>
      <button type="button" onClick={handleClose} className="window-button window-button-red" title="Close">
        <TablerIcon name="x" size={15} />
      </button>
    </div>
  )
}
