import { getCurrentWindow } from '@tauri-apps/api/window'
import { isAutostartLaunch } from './tauri-api'

// Start the silent-launch check the moment this module is evaluated, which
// happens while the bundle loads and React mounts. By the time the shell has
// painted and asks to reveal the window, this check has usually already resolved,
// so revealing waits on nothing on the critical path.
const shouldAutoShow: Promise<boolean> = isAutostartLaunch()
  .then((silent) => !silent)
  // A failed check still reveals the window, so a backend hiccup cannot leave it
  // stuck hidden (the backend also reveals it after a timeout as a safety net).
  .catch(() => true)

let revealed = false

/**
 * Reveal the launcher window exactly once, unless this was a silent sign-in
 * launch. Called after the shell paints so the window appears with content
 * instead of blank; a silent launch stays hidden in the tray.
 */
export async function revealWindowOnce(): Promise<void> {
  if (revealed) return
  revealed = true
  if (!(await shouldAutoShow)) return
  const appWindow = getCurrentWindow()
  await appWindow.show().catch(() => {})
  await appWindow.setFocus().catch(() => {})
}
