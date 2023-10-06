use xshell::{cmd, Shell};

pub(crate) fn run() -> anyhow::Result<()> {
    let sh = Shell::new()?;
    cmd!(sh, "cargo build --workspace --target wasm32-wasi --release").read()?;
    cmd!(sh, "cargo run").read()?;
    Ok(())
}
