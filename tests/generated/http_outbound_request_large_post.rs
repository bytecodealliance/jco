//! This file has been auto-generated, please do not modify manually
//! To regenerate this file re-run `cargo xtask generate tests` from the project root

use std::fs;
use xshell::{cmd, Shell};

#[test]
fn http_outbound_request_large_post() -> anyhow::Result<()> {
    let sh = Shell::new()?;
    let wasi_file = "./tests/rundir/http_outbound_request_large_post.component.wasm";
    let _ = fs::remove_dir_all("./tests/rundir/http_outbound_request_large_post");

    let cmd = cmd!(sh, "node ./src/jco.js run  --jco-dir ./tests/rundir/http_outbound_request_large_post --jco-import ./tests/virtualenvs/http.js {wasi_file} hello this '' 'is an argument' 'with 🚩 emoji'");

    cmd.run()?;
    Ok(())
}
