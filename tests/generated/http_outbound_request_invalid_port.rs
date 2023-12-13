//! This file has been auto-generated, please do not modify manually
//! To regenerate this file re-run `cargo xtask generate tests` from the project root

use std::fs;
use xshell::{cmd, Shell};

#[test]
fn http_outbound_request_invalid_port() -> anyhow::Result<()> {
    let sh = Shell::new()?;
    let wasi_file = "./tests/rundir/http_outbound_request_invalid_port.component.wasm";
    let _ = fs::remove_dir_all("./tests/rundir/http_outbound_request_invalid_port");

    let cmd = cmd!(sh, "node ./src/jco.js run  --jco-dir ./tests/rundir/http_outbound_request_invalid_port --jco-import ./tests/virtualenvs/http.js {wasi_file} hello this '' 'is an argument' 'with 🚩 emoji'");

    cmd.run()?;
    Ok(())
}
