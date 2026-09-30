use std::mem::size_of_val;

use tauri::Window;
use windows::{
  Win32::{
    Foundation::HWND,
    Graphics::Dwm::{
      DwmExtendFrameIntoClientArea, DwmSetWindowAttribute,
      DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND,
    },
    UI::{
      Controls::MARGINS,
      WindowsAndMessaging::{SetWindowPos, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER},
    },
  },
};

pub fn configure(window: &Window) -> Result<(), Box<dyn std::error::Error>> {
  let hwnd = HWND(window.hwnd()?.0);
  unsafe {
    // Enable rounded corners (Windows 11+)
    let corner_preference = DWMWCP_ROUND;
    DwmSetWindowAttribute(
      hwnd,
      DWMWA_WINDOW_CORNER_PREFERENCE,
      std::ptr::from_ref(&corner_preference).cast(),
      size_of_val(&corner_preference) as u32
    )?;

    // Extend frame 1px into client area to enable drop shadow
    DwmExtendFrameIntoClientArea(hwnd, &MARGINS {
      cxLeftWidth: 1,
      cxRightWidth: 1,
      cyTopHeight: 1,
      cyBottomHeight: 1
    })?;

    // Apply changes
    SetWindowPos(
      hwnd,
      None,
      0, 0, 0, 0,
      SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED
    )?;
  }
  Ok(())
}
