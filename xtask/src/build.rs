use xshell::{cmd, Shell};

pub(crate) fn run() -> anyhow::Result<()> {
    let sh = Shell::new()?;
    cmd!(sh, "cargo build --workspace --target wasm32-wasi --release").read()?;
    cmd!(sh, "cargo run").read()?;
    sh.copy_file(
        "lib/wasi_snapshot_preview1.command.wasm",
        "node_modules/@bytecodealliance/jco/lib",
    )?;
    sh.copy_file(
        "lib/wasi_snapshot_preview1.command.wasm",
        "node_modules/@bytecodealliance/jco/lib",
    )?;
    Ok(())
}
