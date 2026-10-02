use std::mem::size_of_val;

use tauri::Window;
use windows::Win32::{
  Foundation::{HWND, LPARAM, LRESULT, POINT, RECT, WPARAM},
  Graphics::{
    Dwm::{DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND},
    Gdi::ScreenToClient,
  },
  UI::{
    Shell::{DefSubclassProc, SetWindowSubclass},
    WindowsAndMessaging::{GetClientRect, HTTRANSPARENT, WM_NCHITTEST},
  },
};

/// Logical window size and the transparent shadow gutter on every side, kept in
/// sync with Tauri.toml and src/index.css. The hit test compares against these as
/// fractions of the live client rect, so it holds at any display scale.
const WINDOW_WIDTH: f64 = 660.0;
const WINDOW_HEIGHT: f64 = 540.0;
const GUTTER: f64 = 30.0;

/// Pass mouse input over the transparent shadow gutter straight through to the
/// window behind the launcher, while the content area stays interactive.
///
/// The window is transparent and draws its shadow into a 30px gutter on every
/// side, so those pixels are visually empty and a click there should reach what
/// is underneath, not the launcher. A DirectComposition transparent window does
/// not hit-test by alpha, so `WM_NCHITTEST` reports `HTTRANSPARENT` for points in
/// the gutter and defers every other point and message to the original window
/// procedure.
unsafe extern "system" fn gutter_passthrough(
  hwnd: HWND,
  message: u32,
  wparam: WPARAM,
  lparam: LPARAM,
  _subclass_id: usize,
  _ref_data: usize,
) -> LRESULT {
  if message == WM_NCHITTEST {
    let mut point = POINT {
      x: (lparam.0 & 0xFFFF) as i16 as i32,
      y: ((lparam.0 >> 16) & 0xFFFF) as i16 as i32,
    };
    let mut client = RECT::default();
    if ScreenToClient(hwnd, &mut point).as_bool() && GetClientRect(hwnd, &mut client).is_ok() {
      let width = (client.right - client.left) as f64;
      let height = (client.bottom - client.top) as f64;
      let left = width * GUTTER / WINDOW_WIDTH;
      let right = width * (WINDOW_WIDTH - GUTTER) / WINDOW_WIDTH;
      let top = height * GUTTER / WINDOW_HEIGHT;
      let bottom = height * (WINDOW_HEIGHT - GUTTER) / WINDOW_HEIGHT;
      let x = point.x as f64;
      let y = point.y as f64;
      if x < left || x > right || y < top || y > bottom {
        return LRESULT(HTTRANSPARENT as isize);
      }
    }
  }
  DefSubclassProc(hwnd, message, wparam, lparam)
}

/// Pin the window to square frame corners and make the shadow gutter click-through.
///
/// The window runs transparent and frameless and draws its rounded corners and
/// drop shadow in CSS, which looks identical on Windows 10 (no native rounding)
/// and Windows 11 (native rounding). Were Windows 11 left to round the frame, it
/// would clip the larger CSS corners, so the corner preference is forced to
/// "do not round". The native shadow is intentionally off (shadow = false in
/// Tauri.toml); the CSS shadow replaces it, which is why removing the frame does
/// not leave the window flat. The subclass then forwards clicks over that shadow
/// gutter to whatever is behind the launcher.
pub fn configure(window: &Window) -> Result<(), Box<dyn std::error::Error>> {
  let hwnd = HWND(window.hwnd()?.0);
  let corner_preference = DWMWCP_DONOTROUND;
  unsafe {
    DwmSetWindowAttribute(
      hwnd,
      DWMWA_WINDOW_CORNER_PREFERENCE,
      std::ptr::from_ref(&corner_preference).cast(),
      size_of_val(&corner_preference) as u32,
    )?;
    let _ = SetWindowSubclass(hwnd, Some(gutter_passthrough), 1, 0);
  }
  Ok(())
}
