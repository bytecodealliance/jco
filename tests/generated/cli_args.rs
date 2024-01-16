//! This file has been auto-generated, please do not modify manually
//! To regenerate this file re-run `cargo xtask generate tests` from the project root

use std::fs;
use std::process::Command;

#[test]
fn cli_args() -> anyhow::Result<()> {
    let wasi_file = "./tests/rundir/cli_args.component.wasm";
    let _ = fs::remove_dir_all("./tests/rundir/cli_args");
    let mut cmd1 = Command::new("node");
    cmd1.arg("./src/jco.js");
    cmd1.arg("run");

    cmd1.arg("--jco-dir");
    cmd1.arg("./tests/rundir/cli_args");
    cmd1.arg("--jco-import");
    cmd1.arg("./tests/virtualenvs/base.js");
    cmd1.arg(wasi_file);
    cmd1.args(&["hello", "this", "", "is an argument", "with 🚩 emoji"]);

    let mut cmd1_child = cmd1.spawn().expect("failed to spawn test program");
    let status = cmd1_child.wait().expect("failed to wait on child");
    assert!(status.success(), "test execution failed");
    Ok(())
}
