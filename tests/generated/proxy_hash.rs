//! This file has been auto-generated, please do not modify manually
//! To regenerate this file re-run `cargo xtask generate tests` from the project root

use std::fs;
// use xshell::{cmd, Shell};

#[test]
fn proxy_hash() -> anyhow::Result<()> {
    // let sh = Shell::new()?;
    // let wasi_file = "./tests/rundir/proxy_hash.component.wasm";
    let _ = fs::remove_dir_all("./tests/rundir/proxy_hash");

    // let cmd = cmd!(sh, "node ./src/jco.js run  --jco-dir ./tests/rundir/proxy_hash --jco-import ./tests/virtualenvs/server-api-proxy-streaming.js {wasi_file} hello this '' 'is an argument' 'with 🚩 emoji'");

    // cmd.run()?;
    panic!("skipped"); // Ok(())
}
