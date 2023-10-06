use structopt::StructOpt;

mod build;
mod self_build;

#[derive(StructOpt)]
enum Opts {
    /// Build the `jco` tools
    SelfBuild,
    /// Build
    Build,
}

fn main() -> anyhow::Result<()> {
    match Opts::from_args() {
        Opts::SelfBuild => self_build::run(),
        Opts::Build => {
            build::run()?;
            self_build::run()?;
            Ok(())
        }
    }
}
