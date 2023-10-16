use structopt::StructOpt;

mod build;
mod test;

#[derive(StructOpt)]
enum Opts {
    /// Build the project
    Build(Build),
    /// Run tests
    Test,
}

#[derive(StructOpt)]
enum Build {
    /// Build and transpile the `jco` tools
    Jco,
    /// Build the shims
    Shims,
    /// Build the project and copy the binaries
    Workspace,
}

fn main() -> anyhow::Result<()> {
    match Opts::from_args() {
        Opts::Build(Build::Jco) => build::jco::run(),
        Opts::Build(Build::Shims) => build::shims::run(),
        Opts::Build(Build::Workspace) => {
            build::workspace::run()?;
            build::jco::run()?;
            Ok(())
        }
        Opts::Test => test::run(),
    }
}
