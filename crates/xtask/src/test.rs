use xshell::{Shell, cmd};

pub fn run(deno: bool) -> anyhow::Result<()> {
    let sh = Shell::new()?;
    if deno {
        cmd!(sh, "cargo test deno_").run()?;
    } else {
        cmd!(sh, "cargo test node_").run()?;
    }
    Ok(())
}
