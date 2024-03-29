//! This file has been auto-generated, please do not modify manually
//! To regenerate this file re-run `cargo xtask generate tests` from the project root

use std::fs;
use std::process::{Command, Stdio};

#[test]
fn piped_simple() -> anyhow::Result<()> {
    #[cfg(not(windows))]
    {
        let wasi_file = "./tests/gen/piped_simple.component.wasm";
        let _ = fs::remove_dir_all("./tests/rundir/piped_simple");
        let mut cmd1 = Command::new("node");
        cmd1.arg("./src/jco.js");
        cmd1.arg("run");
        cmd1.arg("--jco-dir");
        cmd1.arg("./tests/rundir/piped_simple");
        cmd1.arg("--jco-import");
        cmd1.arg("./tests/virtualenvs/piped.js");
        cmd1.arg("--jco-import-bindings");
        cmd1.arg("hybrid");
        cmd1.arg(wasi_file);
        cmd1.args(&["hello", "this", "", "is an argument", "with 🚩 emoji"]);
        cmd1.stdin(Stdio::null());
        cmd1.stdout(Stdio::piped());
        let mut cmd1_child = cmd1.spawn().expect("failed to spawn test program");
        let mut cmd2 = Command::new("node");
        cmd2.arg("./src/jco.js");
        cmd2.arg("run");
        cmd2.arg("--jco-dir");
        cmd2.arg("./tests/rundir/piped_simple_consumer");
        cmd2.arg("--jco-import");
        cmd2.arg("./tests/virtualenvs/piped-consumer.js");
        cmd2.arg("--jco-import-bindings");
        cmd2.arg("hybrid");
        cmd2.arg(wasi_file);
        cmd2.args(&["hello", "this", "", "is an argument", "with 🚩 emoji"]);
        cmd2.stdin(Stdio::null());
        cmd2.stdin(cmd1_child.stdout.take().unwrap());
        let mut cmd2_child = cmd2.spawn().expect("failed to spawn test program");
        let status = cmd2_child.wait().expect("failed to wait on child");
        assert!(status.success(), "test execution failed");
    }
    Ok(())
}
