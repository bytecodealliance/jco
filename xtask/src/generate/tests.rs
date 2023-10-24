use std::fs;
use xshell::{cmd, Shell};

pub fn run() -> anyhow::Result<()> {
    let sh = Shell::new()?;

    // Compile wasmtime test programs
    let guard = sh.push_dir("submodules/wasmtime/crates/test-programs");
    cmd!(sh, "cargo build --target wasm32-wasi --release").run()?;
    drop(guard);

    for entry in fs::read_dir("submodules/wasmtime/target/wasm32-wasi/release")? {
        let entry = entry?;

        // skip all files which don't end with `.wasm`
        if entry.path().extension().map(|p| p.to_str()).flatten() != Some("wasm") {
            continue;
        }

        let path = entry.path();
        let path = match path.to_str() {
            Some(path) => path,
            None => continue,
        };

        // only iterate over the `preview2` test programs
        if !path.contains("preview2") {
            continue;
        }

        cmd!(sh, "src/jco.js run {path}").run()?;
        dbg!(entry);
    }
    Ok(())
}
