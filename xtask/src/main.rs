use structopt::StructOpt;

mod build;
mod build_self;
mod build_shims;

#[derive(StructOpt)]
enum Opts {
    /// Build the `jco` tools
    BuildSelf,
    /// Build
    Build,
    /// Build the shims
    BuildShims,
}

fn main() -> anyhow::Result<()> {
    match Opts::from_args() {
        Opts::BuildSelf => build_self::run(),
        Opts::Build => {
            build::run()?;
            build_self::run()?;
            Ok(())
        }
        Opts::BuildShims => build_shims::run(),
    }
}
