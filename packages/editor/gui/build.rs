use std::env;
use std::fs;
use std::path::Path;

fn main() {
    // Tell Cargo to rerun this script if the assets directory changes
    println!("cargo:rerun-if-changed=assets/");
    
    // Get the output directory
    let out_dir = env::var("OUT_DIR").unwrap();
    let dest_path = Path::new(&out_dir).join("fonts");
    
    // Create the fonts directory in the output
    fs::create_dir_all(&dest_path).unwrap();
    
    // Copy font files to the output directory
    let fonts_dir = Path::new("assets/fonts");
    if fonts_dir.exists() {
        for entry in fs::read_dir(fonts_dir).unwrap() {
            let entry = entry.unwrap();
            let path = entry.path();
            if path.is_file() {
                let file_name = path.file_name().unwrap();
                let dest_file = dest_path.join(file_name);
                fs::copy(&path, &dest_file).unwrap();
                println!("cargo:rerun-if-changed={}", path.display());
            }
        }
    }
}