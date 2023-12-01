use anyhow::anyhow;
use std::{fs::File, path::PathBuf};
use tempdir::TempDir;
use xshell::{cmd, Shell};

/// Compile a `.wasm` file to `.wasm.component` file using `jco`.
pub fn compile(sh: &Shell, tmpdir: &TempDir, file_name: &str) -> anyhow::Result<PathBuf> {
    let src_file: PathBuf =
        format!("./submodules/wasmtime/target/wasm32-wasi/release/{file_name}.wasm").parse()?;
    if !src_file.exists() {
        return Err(anyhow!("src: {src_file:?} does not exists on disk"));
    }

    let out_dir = tmpdir.path();
    let dest_file = out_dir.join(format!("{file_name}.component.wasm"));
    File::create(&dest_file)?;

    cmd!(
        sh,
        "node ./src/jco.js new {src_file} --wasi-command -o {dest_file}"
    )
    .run()?;

    Ok(dest_file)
}
