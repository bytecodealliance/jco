//! This file has been auto-generated, please do not modify manually
//! To regenerate this file re-run `cargo xtask generate tests` from the project root

use std::fs;
use xshell::{cmd, Shell};

#[test]
fn cli_splice_stdin() -> anyhow::Result<()> {
    let sh = Shell::new()?;
    let wasi_file = "./tests/rundir/cli_splice_stdin.component.wasm";
    let _ = fs::remove_dir_all("./tests/rundir/cli_splice_stdin");

    let cmd = cmd!(sh, "node ./src/jco.js run  --jco-dir ./tests/rundir/cli_splice_stdin --jco-import ./tests/virtualenvs/base.js {wasi_file} hello this '' 'is an argument' 'with 🚩 emoji'");

    cmd.run()?;
    Ok(())
}
