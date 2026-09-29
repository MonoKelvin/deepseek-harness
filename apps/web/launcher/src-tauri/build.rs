fn main() {
    tauri_build::build();

    println!("cargo:rerun-if-changed=src");
    println!("cargo:rerun-if-changed=Tauri.toml");
    println!("cargo:rerun-if-changed=icons");
}
