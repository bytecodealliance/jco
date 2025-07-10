use xshell::{cmd, Shell};

pub(crate) fn run(release: bool) -> anyhow::Result<()> {
    let sh = Shell::new()?;

    // Build rust code
    if release {
        cmd!(
            sh,
            "cargo build --workspace --release --target wasm32-wasip1"
        )
        .read()?;
    } else {
        cmd!(sh, "cargo build --workspace --target wasm32-wasip1").read()?;
    }

    // compile all ts code
    cmd!(sh, "npm run --workspaces --if-present compile").read()?;
    Ok(())
}
