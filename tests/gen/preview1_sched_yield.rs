//! This file has been auto-generated, please do not modify manually
//! To regenerate this file re-run `cargo xtask generate tests` from the project root

use std::fs;
use std::process::{Command, Stdio};

#[test]
fn preview1_sched_yield() -> anyhow::Result<()> {
    #[cfg(not(windows))]
    {
        let wasi_file = "./tests/gen/preview1_sched_yield.component.wasm";
        let _ = fs::remove_dir_all("./tests/rundir/preview1_sched_yield");
        let mut cmd1 = Command::new("node");
        cmd1.arg("./src/jco.js");
        cmd1.arg("run");
        cmd1.arg("--jco-dir");
        cmd1.arg("./tests/rundir/preview1_sched_yield");
        cmd1.arg("--jco-import");
        cmd1.arg("./tests/virtualenvs/scratch.js");
        cmd1.arg("--jco-import-bindings");
        cmd1.arg("hybrid");
        cmd1.arg(wasi_file);
        cmd1.args(&["hello", "this", "", "is an argument", "with 🚩 emoji"]);
        cmd1.stdin(Stdio::null());
        let mut cmd1_child = cmd1.spawn().expect("failed to spawn test program");
        let status = cmd1_child.wait().expect("failed to wait on child");
        assert!(status.success(), "test execution failed");
    }
    Ok(())
}
