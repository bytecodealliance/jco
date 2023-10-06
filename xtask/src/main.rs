use structopt::StructOpt;

mod self_build;

#[derive(StructOpt)]
enum Opts {
    /// Build the `jco` tools
    SelfBuild,
}

fn main() -> anyhow::Result<()> {
    match Opts::from_args() {
        Opts::SelfBuild => self_build::run(),
    }
}
