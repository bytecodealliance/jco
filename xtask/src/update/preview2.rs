use super::update_submodules;
use xshell::{cmd, Shell};

pub(crate) fn run() -> anyhow::Result<()> {
    let sh = Shell::new()?;
    update_submodules(&sh)?;
    let _guard = sh.change_dir("submodules/wasmtime");

    // Build the artifacts
    cmd!(sh, "./ci/build-wasi-preview1-component-adapter.sh").run()?;

    // Copy the artifacts over to the main repo
    sh.copy_file(
        "target/wasm32-unknown-unknown/release/wasi_snapshot_preview1.command.wasm",
        "../../lib/",
    )?;
    sh.copy_file(
        "target/wasm32-unknown-unknown/release/wasi_snapshot_preview1.reactor.wasm",
        "../../lib/",
    )?;
    Ok(())
}
