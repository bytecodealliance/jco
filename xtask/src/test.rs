use xshell::{cmd, Shell};

pub fn run() -> anyhow::Result<()> {
    let sh = Shell::new()?;
    cmd!(sh, "cargo test").run()?;
    Ok(())
}
