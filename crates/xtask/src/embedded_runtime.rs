use anyhow::Result;
use xshell::{Shell, cmd};

/// Update the Component Model runtime that `js-component-bindgen` bundles into
/// generated bindings from `packages/jco-cm-runtime`, or with `check` only
/// report whether the committed copy differs from that package.
///
/// Builds never do this implicitly: which runtime the crate embeds is a decision
/// made by committing the files this command writes.
pub(crate) fn run(check: bool) -> Result<()> {
    let sh = Shell::new()?;
    let script = if check {
        "check:embedded-runtime"
    } else {
        "build:embedded-runtime"
    };
    cmd!(
        sh,
        "pnpm run --filter @bytecodealliance/jco-transpile {script}"
    )
    .run()?;
    Ok(())
}
