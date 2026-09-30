use std::mem::size_of_val;

use tauri::{LogicalSize, Window};
use windows::{
  core::Error,
  Win32::{
    Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM},
    Graphics::{
      Dwm::{DwmExtendFrameIntoClientArea, DwmSetWindowAttribute, DWMWA_NCRENDERING_POLICY, DWMNCRP_ENABLED},
      Gdi::{CreateRectRgn, CreateRoundRectRgn, DeleteObject, EqualRgn, GetWindowRgn, SetWindowRgn, HGDIOBJ},
    },
    UI::{
      Controls::MARGINS,
      HiDpi::GetDpiForWindow,
      Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass},
      WindowsAndMessaging::{
        GetWindowRect, GetWindowLongPtrW, SetWindowLongPtrW, GWL_STYLE, WS_THICKFRAME,
        GetClassLongPtrW, SetClassLongPtrW, GCL_STYLE, CS_DROPSHADOW,
        SetWindowPos, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE,
        SWP_NOSIZE, SWP_NOZORDER, WM_NCCALCSIZE, WM_NCDESTROY,
      },
    },
  },
};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct WindowStyle {
  width: u32,
  height: u32,
  corner_radius: u32,
}

const SUBCLASS_ID: usize = 1;

unsafe extern "system" fn frame_proc(hwnd: HWND, message: u32, wparam: WPARAM, lparam: LPARAM, _: usize, _: usize) -> LRESULT {
  if message == WM_NCCALCSIZE && wparam.0 != 0 {
    return LRESULT(0);
  }
  if message == WM_NCDESTROY {
    let _ = RemoveWindowSubclass(hwnd, Some(frame_proc), SUBCLASS_ID);
  }
  DefSubclassProc(hwnd, message, wparam, lparam)
}

pub fn configure(window: &Window) -> Result<(), Box<dyn std::error::Error>> {
  let hwnd = HWND(window.hwnd()?.0);
  unsafe {
    SetWindowSubclass(hwnd, Some(frame_proc), SUBCLASS_ID, 0).ok()?;
    let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
    SetWindowLongPtrW(hwnd, GWL_STYLE, style | WS_THICKFRAME.0 as isize);
    let policy = DWMNCRP_ENABLED;
    DwmSetWindowAttribute(hwnd, DWMWA_NCRENDERING_POLICY, std::ptr::from_ref(&policy).cast(), size_of_val(&policy) as u32)?;
    DwmExtendFrameIntoClientArea(hwnd, &MARGINS { cxLeftWidth: 1, cxRightWidth: 1, cyTopHeight: 1, cyBottomHeight: 1 })?;
    SetWindowPos(hwnd, None, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED)?;
  }
  let style: WindowStyle = serde_json::from_str(include_str!("../../src/window-style.json"))?;
  window.set_size(LogicalSize::new(style.width, style.height))?;
  update_region(window)?;
  Ok(())
}

pub fn update_region(window: &Window) -> Result<(), Box<dyn std::error::Error>> {
  let style: WindowStyle = serde_json::from_str(include_str!("../../src/window-style.json"))?;
  let hwnd = HWND(window.hwnd()?.0);
  unsafe {
    if style.corner_radius == 0 {
      if SetWindowRgn(hwnd, None, true) == 0 { return Err(Error::from_thread().into()); }
      return Ok(());
    }
    let mut rect = RECT::default();
    GetWindowRect(hwnd, &mut rect)?;
    let diameter = (style.corner_radius * 2 * GetDpiForWindow(hwnd) / 96) as i32;
    let region = CreateRoundRectRgn(0, 0, rect.right - rect.left + 1, rect.bottom - rect.top + 1, diameter, diameter);
    if region.is_invalid() { return Err(Error::from_thread().into()); }
    let current = CreateRectRgn(0, 0, 0, 0);
    if current.is_invalid() {
      let _ = DeleteObject(HGDIOBJ(region.0));
      return Err(Error::from_thread().into());
    }
    let matches = GetWindowRgn(hwnd, current).0 != 0 && EqualRgn(current, region).as_bool();
    let _ = DeleteObject(HGDIOBJ(current.0));
    if matches {
      let _ = DeleteObject(HGDIOBJ(region.0));
    } else if SetWindowRgn(hwnd, Some(region), true) == 0 {
      let error = Error::from_thread();
      let _ = DeleteObject(HGDIOBJ(region.0));
      return Err(error.into());
    }
  }
  Ok(())
}
