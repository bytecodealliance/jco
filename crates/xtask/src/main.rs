use structopt::StructOpt;

mod build;
mod generate;
mod test;

#[derive(StructOpt)]
enum Cmd {
    /// Build the project
    Build(Build),
    /// Run cargo tests
    Test(Platform),
    /// Generate code
    Generate(Generate),
    /// Build test components (i.e. `test-components` crate)
    BuildTestComponents,
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
    /// Build the project and copy the components
    Debug,
    /// Build the project for release and copy the components
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
    match Cmd::from_args() {
        Cmd::Build(Build::Debug) => {
            build::workspace::run(false)?;
            build::jco::run(false)?;
            Ok(())
        }
        Cmd::Build(Build::Release) => {
            build::workspace::run(true)?;
            build::jco::run(true)?;
            Ok(())
        }
        Cmd::BuildTestComponents => {
            build::test_components::run()?;
            Ok(())
        }
        Cmd::Test(Platform::Node) => test::run(false),
        Cmd::Test(Platform::Deno) => test::run(true),
        Cmd::Generate(Generate::WebidlTests) => generate::webidl_tests::run(),
        Cmd::Generate(Generate::WasiTypes(ver)) => generate::wasi_types::run(ver),
        Cmd::Generate(Generate::Tests(WasiVersion::Preview2)) => generate::preview2_tests::run(),
        Cmd::Generate(Generate::Tests(WasiVersion::Preview3)) => {
            unimplemented!("Wasi Preview 3 tests are not implemented yet")
        }
    }
}
