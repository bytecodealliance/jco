use std::fs;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Duration, Instant};

use js_component_bindgen::{InstantiationMode, TranspileOpts, transpile};

static NEXT_DIR: AtomicUsize = AtomicUsize::new(0);

struct TestDir(PathBuf);
impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

/// Exercise the actual generated bindings, including Wasm and JSPI, in Node.
pub fn run_component(component: &str, assertions: &str) {
    let node = std::env::var_os("NODE").unwrap_or_else(|| "node".into());
    let supported = Command::new(&node)
        .args([
            "-e",
            "process.exit(typeof WebAssembly.Suspending === 'function' ? 0 : 1)",
        ])
        .status();
    if !supported.is_ok_and(|status| status.success()) {
        eprintln!("skipping runtime regression: NODE must select a Node.js with JSPI");
        return;
    }
    let dir = TestDir(std::env::temp_dir().join(format!(
        "jco-runtime-test-{}-{}",
        std::process::id(),
        NEXT_DIR.fetch_add(1, Ordering::Relaxed),
    )));
    fs::create_dir(&dir.0).unwrap();
    let bytes = wat::parse_str(component).unwrap();
    let output = transpile(
        &bytes,
        TranspileOpts::builder()
            .name("component".into())
            .no_typescript(true)
            .instantiation_mode(InstantiationMode::Async)
            .base64_cutoff(0)
            .build(),
    )
    .unwrap();
    for (name, bytes) in output.files {
        let path = dir.0.join(name);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, bytes).unwrap();
    }
    fs::write(dir.0.join("package.json"), r#"{"type":"module"}"#).unwrap();
    fs::write(
        dir.0.join("test.mjs"),
        format!(
            r#"
import assert from 'node:assert/strict';
import {{ readFile }} from 'node:fs/promises';
import {{ instantiate }} from './component.js';
const fresh = (imports = {{}}) => instantiate(
    async (name) => WebAssembly.compile(await readFile(new URL(name, import.meta.url))),
    imports,
);
{assertions}
"#
        ),
    )
    .unwrap();
    let mut child = Command::new(node)
        .arg("--unhandled-rejections=strict")
        .arg(dir.0.join("test.mjs"))
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(15);
    let mut timed_out = false;
    while child.try_wait().unwrap().is_none() {
        if Instant::now() >= deadline {
            child.kill().unwrap();
            timed_out = true;
            break;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    let output = child.wait_with_output().unwrap();
    assert!(
        !timed_out && output.status.success(),
        "runtime regression failed (timeout={timed_out}):\nstdout: {}\nstderr: {}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}
