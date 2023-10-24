//! A prototype of the integration tests we'll start generating

use anyhow::anyhow;
use std::{fs::File, path::PathBuf};
use tempdir::TempDir;
use xshell::{cmd, Shell};

#[test]
fn cli_hello_stdout() -> anyhow::Result<()> {
    let sh = Shell::new()?;
    let tempdir = TempDir::new("jco-test")?;
    let file_name = "cli_hello_stdout";
    let wasi_file = generate_new(&sh, &tempdir, &file_name)?;
    cmd!(sh, "./src/jco.js run {wasi_file}").run()?;
    Ok(())
}

fn generate_new(sh: &Shell, tmpdir: &TempDir, file_name: &str) -> anyhow::Result<PathBuf> {
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
        "./src/jco.js new {src_file} --wasi-command -o {dest_file}"
    )
    .run()?;

    Ok(dest_file)
}
