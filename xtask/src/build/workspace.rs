use xshell::{cmd, Shell};

pub(crate) fn run(release: bool) -> anyhow::Result<()> {
    let sh = Shell::new()?;
    if release {
        cmd!(sh, "cargo build --workspace --release --target wasm32-wasi").read()?;
    } else {
        cmd!(sh, "cargo build --workspace --target wasm32-wasi").read()?;
    }
    cmd!(sh, "node node_modules/typescript/bin/tsc -p tsconfig.json").read()?;
    sh.copy_file(
        "lib/wasi_snapshot_preview1.command.wasm",
        "node_modules/@golemcloud/jco/lib",
    )?;
    sh.copy_file(
        "lib/wasi_snapshot_preview1.reactor.wasm",
        "node_modules/@golemcloud/jco/lib",
    )?;
    Ok(())
}
