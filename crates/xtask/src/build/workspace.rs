use xshell::{Shell, cmd};

/// Regenerate the Component Model runtime that `js-component-bindgen` bundles into
/// generated bindings, so that the committed copy under its `runtime/` directory
/// always matches `packages/jco-cm-runtime`.
fn generate_embedded_runtime(sh: &Shell) -> anyhow::Result<()> {
    cmd!(
        sh,
        "pnpm run --filter @bytecodealliance/jco-transpile build:embedded-runtime"
    )
    .run()?;
    Ok(())
}

pub(crate) fn run(release: bool) -> anyhow::Result<()> {
    let sh = Shell::new()?;

    // The bindgen component embeds the runtime, so it must be current before compiling.
    generate_embedded_runtime(&sh)?;

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
