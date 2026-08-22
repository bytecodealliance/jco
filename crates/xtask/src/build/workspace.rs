use xshell::{Shell, cmd};

pub(crate) fn run(release: bool) -> anyhow::Result<()> {
    let sh = Shell::new()?;

    // Build only the crates that produce WASI components. Other workspace
    // members may target the host or another platform.
    if release {
        cmd!(
            sh,
            "cargo build --package js-component-bindgen-component --package wasm-tools-js --release --target wasm32-wasip1"
        )
        .read()?;
    } else {
        cmd!(
            sh,
            "cargo build --package js-component-bindgen-component --package wasm-tools-js --target wasm32-wasip1"
        )
        .read()?;
    }

    Ok(())
}
