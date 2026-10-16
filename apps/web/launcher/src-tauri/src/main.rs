// Release builds use the GUI subsystem so Windows does not open a console window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  dsh_web_launcher_lib::run();
}
