use structopt::StructOpt;

mod build;
mod generate;
mod test;
mod update;

#[derive(StructOpt)]
enum Opts {
    /// Build the project
    Build(Build),
    /// Run cargo tests
    Test,
    /// Update the various dependencies in the project
    Update(Update),
    /// Generate code
    Generate(Generate),
}

#[derive(StructOpt)]
enum Update {
    /// Update preview 2
    Preview2,
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

#[derive(StructOpt)]
enum Generate {
    /// Generate tests
    Tests,
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
        Opts::Update(Update::Preview2) => update::preview2::run(),
        Opts::Generate(Generate::Tests) => generate::tests::run(),
    }
}
