use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::str::FromStr;

use anyhow::{Context, Result, bail};
use js_component_bindgen::{BindingsMode, InstantiationMode};
use wit_component::ComponentEncoder;
use xshell::{Shell, cmd};

use crate::build::{WORKSPACE_DIR, compile_jco_typescript};

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
    unsafe {
        std::env::set_var("RUST_BACKTRACE", "1");
    }
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

    let mut encoder = ComponentEncoder::default();
    encoder.validate(true).module(&component)?;
    encoder.adapter("wasi_snapshot_preview1", &adapter)?;

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
            // Build the components needed to bootstrap the optimizer.
            crate::build::workspace::run(false)?;
            // Transpile the built components so they can be used for optimization
            transpile_components(BuildType::Debug).context("transpiling all components (debug)")?;
        }

        // The debug bootstrap above transpiles *all* components (including this
        // one) into the same `obj/<name>.component.wasm` paths, overwriting the
        // release component written earlier with the debug build. Re-write ours
        // so that `jco opt` (and the transpile below) operates on the release
        // component, not the debug one.
        fs::write(&component_path, &adapted_component)?;

        compile_jco_typescript()
            .context("compiling the Jco TypeScript CLI for component optimization")?;
        let jco_script_path = format!(
            "{}",
            WORKSPACE_DIR.join("packages/jco/dist/jco.js").display()
        );
        // These are the defaults of `jco opt`, plus the saturating float-to-int
        // conversions that Rust emits for WebAssembly targets.
        let wasm_opt_args = [
            "-Oz",
            "--low-memory-unused",
            "--enable-bulk-memory",
            "--enable-nontrapping-float-to-int",
            "--strip-debug",
        ];
        cmd!(
            sh,
            "node {jco_script_path} opt {component_path} -o {component_path} -- {wasm_opt_args...}"
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
            "wasi:clocks/*".into(),
            "@bytecodealliance/preview2-shim/clocks#*".into(),
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
    let opts = js_component_bindgen::TranspileOpts::builder()
        .name(name.clone())
        .no_typescript(false)
        .map(import_map)
        .nodejs_compat_disabled(false)
        // The ES module and instantiable builds share core modules by filename,
        // and an instantiable build requests every one from its loader.
        .base64_cutoff(0)
        .tla_compat(true)
        .valid_lifting_optimization(false)
        .tracing(false)
        .no_namespaced_exports(true)
        .multi_memory(true)
        .import_bindings(BindingsMode::Js)
        .guest(false)
        // TODO(breaking): strict by default
        .strict(false)
        .asmjs(false)
        .build();

    let mut transpiled = js_component_bindgen::transpile(&adapted_component, opts.clone())?;

    // An instantiable build takes its WASI imports as an argument, so the JS API
    // can give each tool a private filesystem instead of the shim's global one.
    // It also lets the API discard a trapped bindgen instance and instantiate a
    // new one without reloading an ES module or recompiling its core Wasm modules.
    {
        let mut factory_opts = opts;
        factory_opts.instantiation_mode = Some(InstantiationMode::Async);
        factory_opts.map = None;
        let factory = js_component_bindgen::transpile(&adapted_component, factory_opts)?;
        for (filename, contents) in factory.files {
            if let Some(extension @ ("js" | "d.ts")) = filename.strip_prefix(&format!("{name}.")) {
                transpiled
                    .files
                    .push((format!("{name}-instantiation.{extension}"), contents));
            }
        }
    }

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
    compile_jco_typescript()?;
    Ok(())
}
