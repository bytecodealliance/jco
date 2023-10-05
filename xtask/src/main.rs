use structopt::StructOpt;

mod self_build;

#[derive(StructOpt)]
enum Opts {
    /// Build self
    Build,
}

fn main() -> anyhow::Result<()> {
    match Opts::from_args() {
        Opts::Build => self_build::run(),
    }
}
