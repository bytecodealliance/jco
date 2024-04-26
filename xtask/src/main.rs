use structopt::StructOpt;

mod build;
mod generate;
mod test;

#[derive(StructOpt)]
enum Opts {
    /// Build the project
    Build(Build),
    /// Run cargo tests
    Test(Platform),
    /// Generate code
    Generate(Generate),
}

#[derive(StructOpt)]
enum Platform {
    /// Test on Node.js
    Node,
    /// Test on Deno
    Deno,
}

#[derive(StructOpt)]
enum Build {
    /// Build the project and copy the binaries
    Debug,
    /// Build the project for release and copy the binaries
    Release,
}

#[derive(StructOpt)]
enum Generate {
    /// Generate WASI conformance tests from Wasmtime
    Tests,
    /// Generate the WASI Preview 2 types
    WasiTypes,
}

fn main() -> anyhow::Result<()> {
    match Opts::from_args() {
        Opts::Build(Build::Debug) => {
            build::workspace::run(false)?;
            build::jco::run(false)?;
            Ok(())
        }
        Opts::Build(Build::Release) => {
            build::workspace::run(true)?;
            build::jco::run(true)?;
            Ok(())
        }
        Opts::Test(Platform::Node) => test::run(false),
        Opts::Test(Platform::Deno) => test::run(true),
        Opts::Generate(Generate::Tests) => generate::tests::run(),
        Opts::Generate(Generate::WasiTypes) => generate::wasi_types::run(),
    }
}
