use xshell::{cmd, Shell};

pub(crate) fn run(release: bool) -> anyhow::Result<()> {
    let sh = Shell::new()?;
    if release {
        cmd!(
            sh,
            "cargo build --workspace --release --target wasm32-wasip1"
        )
        .read()?;
    } else {
        cmd!(sh, "cargo build --workspace --target wasm32-wasip1").read()?;
    }
    cmd!(sh, "node node_modules/typescript/bin/tsc -p tsconfig.json").read()?;
    Ok(())
}
