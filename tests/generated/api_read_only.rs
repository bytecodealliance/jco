//! This file has been auto-generated, please do not modify manually
//! To regenerate this file re-run `cargo xtask generate tests` from the project root

use std::fs;
use xshell::{cmd, Shell};

#[test]
fn api_read_only() -> anyhow::Result<()> {
    let sh = Shell::new()?;
    let wasi_file = "./tests/rundir/api_read_only.component.wasm";
    let _ = fs::remove_dir_all("./tests/rundir/api_read_only");

    let cmd = cmd!(sh, "node ./src/jco.js run  --jco-dir ./tests/rundir/api_read_only --jco-import ./tests/virtualenvs/readonly.js {wasi_file} hello this '' 'is an argument' 'with 🚩 emoji'");

    cmd.run()?;
    Ok(())
}
