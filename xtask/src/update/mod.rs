use xshell::{cmd, Shell};

pub(crate) mod preview2;

fn update_submodules(sh: &Shell) -> anyhow::Result<()> {
    cmd!(sh, "git submodule foreach git pull origin main").run()?;
    cmd!(sh, "git submodule update --init --recursive").run()?;
    Ok(())
}
