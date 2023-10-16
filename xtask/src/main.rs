use structopt::StructOpt;

mod build;
mod build_self;
mod build_shims;
mod test;
mod update;

#[derive(StructOpt)]
enum Opts {
    /// Build the `jco` tools
    BuildSelf,
    /// Build
    Build,
    /// Build the shims
    BuildShims,
    /// Run tests
    Test,
    /// Update the various dependencies in the project
    Update(Update),
}

#[derive(StructOpt)]
enum Update {
    /// Update preview 2
    Preview2,
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
        Opts::Test => test::run(),
        Opts::Update(Update::Preview2) => update::preview2::run(),
    }
}
