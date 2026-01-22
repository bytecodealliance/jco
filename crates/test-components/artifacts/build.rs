//! This build script builds the test components that are in the `test-components` crate.
//!
//! This crate (`test-components-artifacts`) functions only to build those components and
//! place their outputs somewhere in particular.
//!
//! The code in this file is heavily inspired/copied from:
//! https://github.com/bytecodealliance/wasmtime/blob/main/crates/test-programs/artifacts/build.rs
//!
use std::path::{Path, PathBuf};

use anyhow::{Context as _, Result, ensure};
use tokio::process::Command;
use wit_component::ComponentEncoder;

const JCO_TEST_COMPONENTS_PACKAGE_NAME: &str = "jco-test-components";

/// Component model versions
#[derive(PartialEq, Eq, Clone)]
enum ComponentModelVersion {
    P1,
    P3,
}

/// Build output that is a Wasm component
#[derive(Clone)]
struct BuiltComponent {
    /// Version of the component model
    cm_version: ComponentModelVersion,
    /// Name of the component (binary name without '.wasm')
    name: String,
    /// Path to the component bytes on disk
    wasm_path: PathBuf,
}

#[tokio::main]
async fn main() -> Result<()> {
    // Determine paths
    let output_dir =
        PathBuf::from(std::env::var_os("OUT_DIR").context("missing OUT_DIR env variable")?);
    let cargo_manifest_dir = PathBuf::from(
        std::env::var_os("CARGO_MANIFEST_DIR")
            .context("missing CARGO_MANIFEST_DIR env variable")?,
    );
    let p1_adapter_path = cargo_manifest_dir
        .join("../../../packages/jco/test/fixtures/wasi_snapshot_preview1.reactor.wasm");

    // Build p3 components
    let p3_components = build_test_p3_components(output_dir, p1_adapter_path)
        .await
        .context("failed to build artifacts")?;

    // Copy all p3 components to packages/jco/output
    let rust_test_components_dir =
        cargo_manifest_dir.join("../../../packages/jco/test/output/rust-test-components");
    tokio::fs::create_dir_all(&rust_test_components_dir)
        .await
        .context("failed to create rust test component output dir")?;
    for BuiltComponent {
        cm_version,
        wasm_path,
        name,
    } in p3_components
    {
        ensure!(
            cm_version == ComponentModelVersion::P3,
            "unexpectedly got non-p3 component during copy step"
        );
        tokio::fs::copy(
            &wasm_path,
            rust_test_components_dir.join(format!("{name}.wasm")),
        )
        .await
        .with_context(|| format!("failed to copy over built wasm [{}]", wasm_path.display()))?;
    }

    Ok(())
}

/// Build all wasm components from the `jco-test-components` crate
///
/// We expect all components in question to be P3 reactor components,
/// and we expect to build *all* the components in the test-components/src/bin,
/// via their project names.
///
/// # Arguments
///
/// * `output_dir`           - output directory into which built components will be copied
/// * `reactor_adapter_path` - path to a reactor that should be used to build the components from wasip1
///
async fn build_test_p3_components(
    output_dir: impl AsRef<Path>,
    p1_adapter_path: impl AsRef<Path>,
) -> Result<Vec<BuiltComponent>> {
    let p1_adapter_path = p1_adapter_path.as_ref();

    let components = build_test_components(output_dir)
        .await
        .context("failed to build test components")?;

    let mut built_components = Vec::with_capacity(components.len());
    for BuiltComponent {
        cm_version,
        name,
        wasm_path,
    } in components
    {
        match cm_version {
            // Build a p1 component into a p3 comopnent
            ComponentModelVersion::P1 => {
                let p3_component_path = encode_p1_component(&wasm_path, p1_adapter_path)
                    .await
                    .with_context(|| format!("failed to encode p1 component [{name}]"))?;
                eprintln!(
                    "wrote out composed component to [{}]",
                    p3_component_path.display()
                );
                built_components.push(BuiltComponent {
                    cm_version: ComponentModelVersion::P3,
                    name,
                    wasm_path: p3_component_path,
                })
            }
            // Components that are already p3 components are done
            ComponentModelVersion::P3 => built_components.push(BuiltComponent {
                cm_version,
                name,
                wasm_path,
            }),
        }
    }

    Ok(built_components)
}

/// Build all binaries in `test-components` into p3 components
async fn build_test_components(output_dir: impl AsRef<Path>) -> Result<Vec<BuiltComponent>> {
    let output_dir = output_dir.as_ref();
    let mut components = Vec::new();

    // Build the cargo command
    let mut cmd = cargo_bin();
    cmd.arg("build");
    cmd.arg("--release");
    cmd.arg("--target=wasm32-wasip1");
    cmd.arg(format!("--package={}", JCO_TEST_COMPONENTS_PACKAGE_NAME));
    cmd.env("CARGO_TARGET_DIR", format!("{}", output_dir.display()));
    eprintln!("running cargo command: [{cmd:?}]");

    // Run the cargo command
    let status = cmd.status().await.context("failed to run cargo cmd")?;
    assert!(status.success(), "cargo cmd failed");

    // Retrieve metadata for the cargo run,
    let meta = cargo_metadata::MetadataCommand::new()
        .exec()
        .context("failed to run cargo-metadata command")?;
    let targets = meta
        .packages
        .iter()
        .find(|p| p.name == JCO_TEST_COMPONENTS_PACKAGE_NAME)
        .context("unexpectedly missing test-components package in output of cargo-metadata")?
        .targets
        .iter()
        .filter(move |t| t.kind == [cargo_metadata::TargetKind::Bin])
        .map(|t| &t.name)
        .collect::<Vec<_>>();
    for target in targets {
        let wasm_path = output_dir
            .join("wasm32-wasip1")
            .join("release")
            .join(format!("{target}.wasm"));
        components.push(BuiltComponent {
            cm_version: ComponentModelVersion::P1,
            name: target.to_string(),
            wasm_path,
        })
    }

    Ok(components)
}

/// Compile a given p1 component, converting it into a p3 component
async fn encode_p1_component(
    wasm_path: impl AsRef<Path>,
    p1_adapter_path: impl AsRef<Path>,
) -> Result<PathBuf> {
    let wasm_path = wasm_path.as_ref();
    let adapter_path = p1_adapter_path.as_ref();
    eprintln!(
        "compiling p3 component from wasm @ [{}] (adapter @ {})",
        wasm_path.display(),
        adapter_path.display(),
    );

    // Read the component and adapter bytes
    let (p1_component_bytes, adapter_bytes) =
        tokio::join!(tokio::fs::read(&wasm_path), tokio::fs::read(&adapter_path));
    let p1_component_bytes = p1_component_bytes.with_context(|| {
        format!(
            "failed to read p1 wasm component @ [{}]",
            wasm_path.display()
        )
    })?;
    let adapter_bytes = adapter_bytes.with_context(|| {
        format!(
            "failed to read p1 wasm component @ [{}]",
            wasm_path.display()
        )
    })?;

    // Encode the component into a P3 component
    let p3_component = ComponentEncoder::default()
        .module(p1_component_bytes.as_slice())
        .context("failed to build module")?
        .validate(true)
        .adapter("wasi_snapshot_preview1", &adapter_bytes)
        .context("failed to set adapter")?
        .encode()
        .context("failed to encode component")?;

    let out_dir = wasm_path
        .parent()
        .context("failed to find parent dir of written wasm")?;
    let stem = wasm_path
        .file_stem()
        .context("failed to determine file stem of written wasm")?
        .to_str()
        .context("cailed to convert file stem to string")?;
    let component_path = out_dir.join(format!("{stem}.component.wasm"));

    tokio::fs::write(&component_path, p3_component)
        .await
        .with_context(|| {
            format!(
                "failed to write component to disk @ [{}]",
                component_path.display()
            )
        })?;

    Ok(component_path)
}

/// Cargo binary
fn cargo_bin() -> Command {
    Command::new(std::env::var("CARGO").unwrap_or_else(|_| "cargo".into()))
}
