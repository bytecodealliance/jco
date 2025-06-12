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
    Tests(WasiVersion),
    /// Generate the WASI types
    WasiTypes(WasiVersion),
    /// Generate WebIDL tests
    WebidlTests,
}

#[derive(StructOpt)]
pub(crate) enum WasiVersion {
    /// Wasi Preview 2 version
    Preview2,
    /// Wasi Preview 3 version
    Preview3,
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
        Opts::Generate(Generate::WebidlTests) => generate::webidl_tests::run(),
        Opts::Generate(Generate::WasiTypes(ver)) => generate::wasi_types::run(ver),
        Opts::Generate(Generate::Tests(WasiVersion::Preview2)) => generate::preview2_tests::run(),
        Opts::Generate(Generate::Tests(WasiVersion::Preview3)) => {
            unimplemented!("Wasi Preview 3 tests are not implemented yet")
        }
    }
}
