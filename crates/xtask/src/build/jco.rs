use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::str::FromStr;
use std::{collections::HashMap, sync::LazyLock};

use anyhow::{bail, Context, Result};
use js_component_bindgen::BindingsMode;
use wit_component::ComponentEncoder;
use xshell::{cmd, Shell};

static WORKSPACE_DIR: LazyLock<PathBuf> = LazyLock::new(|| {
    // NOTE this goes to the xtask dir
    let xtask_manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    xtask_manifest_dir.join("../../")
});

/// Type of build being performed
#[derive(Debug, Eq, PartialEq, Clone)]
enum BuildType {
    Release,
    Debug,
}

impl FromStr for BuildType {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self> {
        match s.to_lowercase().as_str() {
            "release" => Ok(Self::Release),
            "debug" => Ok(Self::Debug),
            _ => bail!("invalid BuildType [{s}]"),
        }
    }
}

impl std::fmt::Display for BuildType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BuildType::Release => write!(f, "release"),
            BuildType::Debug => write!(f, "debug"),
        }
    }
}

/// Helper function that compiles both js-component-bindgen and wasm-tools components
///
/// This is factored out to ensure it is easy to call in the case of a release build
/// that needs to be bootstrapped (bindgen and then wasm-tools must be built in that order)
fn transpile_components(build_type: BuildType) -> Result<()> {
    let optimize = build_type == BuildType::Release;

    // NOTE this goes to the xtask dir
    let workspace_dir = &*WORKSPACE_DIR.to_path_buf();

    transpile(TranspileArgs {
        component_path: workspace_dir.join(format!(
            "target/wasm32-wasip1/{build_type}/js_component_bindgen_component.wasm"
        )),
        name: "js-component-bindgen-component".into(),
        optimize,
        build_type: build_type.clone(),
    })
    .context("transpiling js-component-bindgen-component")?;

    transpile(TranspileArgs {
        component_path: workspace_dir.join(format!(
            "target/wasm32-wasip1/{build_type}/wasm_tools_js.wasm"
        )),
        name: "wasm-tools".into(),
        optimize,
        build_type,
    })
    .context("transpiling wasm-tools")?;
    Ok(())
}

/// Arguments for transpilation
struct TranspileArgs {
    /// Path to the component
    component_path: PathBuf,
    /// The name of the component
    name: String,
    /// Whether to optimize the build
    optimize: bool,
    /// Type of build
    build_type: BuildType,
}

fn transpile(args: TranspileArgs) -> Result<()> {
    let TranspileArgs {
        component_path,
        name,
        optimize,
        build_type,
    } = args;
    std::env::set_var("RUST_BACKTRACE", "1");
    let component_path = PathBuf::from(&component_path)
        .canonicalize()
        .with_context(|| {
            format!(
                "failed to resolve component path [{}]",
                component_path.display()
            )
        })?;
    let component = fs::read(&component_path).with_context(|| {
        format!(
            "wasm bindgen component missing @ [{}]",
            component_path.display()
        )
    })?;

    let adapter_path = &*WORKSPACE_DIR.join("packages/jco/lib/wasi_snapshot_preview1.reactor.wasm");
    let adapter = fs::read(adapter_path).with_context(|| {
        format!(
            "preview1 adapter file missing @ [{}]",
            adapter_path.display()
        )
    })?;

    let mut encoder = ComponentEncoder::default()
        .validate(true)
        .module(&component)?;

    encoder = encoder.adapter("wasi_snapshot_preview1", &adapter)?;

    let obj_dir = WORKSPACE_DIR.join("packages/jco/obj");
    let mut adapted_component = encoder.encode()?;
    fs::create_dir_all(&obj_dir)?;
    let mut component_path = obj_dir.join(&name);
    component_path.set_extension("component.wasm");
    fs::write(&component_path, &adapted_component)?;

    let sh = Shell::new()?;
    if optimize {
        // If building a release build, to optimize we must have wasm-tools,
        // and the only way to build it before use is an *unoptimized* build,
        // which means a debug build.
        if build_type == BuildType::Release
            && !fs::exists(obj_dir.join("wasm-tools.js"))
                .context("checking for obj/wasm-tools.js")?
        {
            // Build the workspace and the components
            cmd!(sh, "cargo build --workspace --target wasm32-wasip1").read()?;
            // Transpile the built components so they can be used for optimization
            transpile_components(BuildType::Debug).context("transpiling all components (debug)")?;
        }

        let jco_script_path = format!(
            "{}",
            WORKSPACE_DIR.join("packages/jco/src/jco.js").display()
        );
        cmd!(
            sh,
            "node {jco_script_path} opt {component_path} -o {component_path}"
        )
        .read()?;
        adapted_component = fs::read(component_path)?;
    }

    let import_map = HashMap::from([
        (
            "wasi:cli/*".into(),
            "@bytecodealliance/preview2-shim/cli#*".into(),
        ),
        (
            "wasi:filesystem/*".into(),
            "@bytecodealliance/preview2-shim/filesystem#*".into(),
        ),
        (
            "wasi:io/*".into(),
            "@bytecodealliance/preview2-shim/io#*".into(),
        ),
        (
            "wasi:random/*".into(),
            "@bytecodealliance/preview2-shim/random#*".into(),
        ),
        (
            "wasi:sockets/*".into(),
            "@bytecodealliance/preview2-shim/sockets#*".into(),
        ),
    ]);
    let opts = js_component_bindgen::TranspileOpts {
        name,
        no_typescript: false,
        instantiation: None,
        map: Some(import_map),
        no_nodejs_compat: false,
        base64_cutoff: 5000_usize,
        tla_compat: true,
        valid_lifting_optimization: false,
        tracing: false,
        no_namespaced_exports: true,
        multi_memory: true,
        import_bindings: Some(BindingsMode::Js),
        guest: false,
        async_mode: None,
    };

    let transpiled = js_component_bindgen::transpile(&adapted_component, opts)?;

    for (filename, contents) in transpiled.files.iter() {
        let outfile = obj_dir.join(filename);
        fs::create_dir_all(outfile.parent().unwrap()).unwrap();
        let mut file = fs::File::create(outfile).unwrap();
        file.write_all(contents).unwrap();
    }

    Ok(())
}

pub(crate) fn run(release: bool) -> Result<()> {
    let build_type = BuildType::from_str(if release { "release" } else { "debug" })?;
    transpile_components(build_type)?;
    Ok(())
}
