use structopt::StructOpt;

mod build;

#[derive(StructOpt)]
enum Opts {
    /// Build the `jco` tools
    Build,
}

fn main() -> anyhow::Result<()> {
    match Opts::from_args() {
        Opts::Build => build::run(),
    }
}
