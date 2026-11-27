//! Which components `perf_sync_fast_path` applies to, and what it generates.

use js_component_bindgen::{
    AsyncMode, BindingsMode, InstantiationMode, TranspileConfig, TranspileDiagnostics,
    TranspileOpts, Transpiled, transpile_with_config, transpile_with_diagnostics,
};

/// One component instance with a synchronous import, a synchronous export that
/// has a post-return function, and a handle to a resource of the host.
const ELIGIBLE: &str = r#"
(component
  (import "host" (instance $host
    (export "thing" (type $thing (sub resource)))
    (export "double" (func (param "value" u32) (result u32)))))
  (alias export $host "thing" (type $thing))
  (core func $lower (canon lower (func $host "double")))
  (core func $drop (canon resource.drop $thing))
  (core module $m
    (import "" "double" (func $double (param i32) (result i32)))
    (import "" "drop" (func $drop (param i32)))
    (func (export "run") (param i32) (result i32) (call $double (local.get 0)))
    (func (export "post") (param i32))
    (func (export "consume") (param i32) (call $drop (local.get 0))))
  (core instance $i (instantiate $m (with "" (instance
    (export "double" (func $lower))
    (export "drop" (func $drop))))))
  (func (export "run") (param "value" u32) (result u32)
    (canon lift (core func $i "run") (post-return (core func $i "post"))))
  (func (export "consume") (param "thing" (own $thing))
    (canon lift (core func $i "consume"))))
"#;

/// One component instance that defines a resource, whose destructor calls an import.
const GUEST_RESOURCE: &str = r#"
(component
  (import "notify" (func $notify (param "code" u32)))
  (component $api
    (import "notify" (func $notify (param "code" u32)))
    (core func $notify (canon lower (func $notify)))
    (core module $destructor
      (import "" "notify" (func $notify (param i32)))
      (func (export "dtor") (param i32) (call $notify (local.get 0))))
    (core instance $destructor (instantiate $destructor
      (with "" (instance (export "notify" (func $notify))))))
    (type $thing (resource (rep i32) (dtor (core func $destructor "dtor"))))
    (core func $new (canon resource.new $thing))
    (core func $rep (canon resource.rep $thing))
    (core func $drop (canon resource.drop $thing))
    (core module $m
      (import "" "new" (func $new (param i32) (result i32)))
      (import "" "rep" (func $rep (param i32) (result i32)))
      (import "" "drop" (func $drop (param i32)))
      (func (export "new") (param i32) (result i32) (call $new (local.get 0)))
      (func (export "consume") (param i32) (result i32)
        (call $rep (local.get 0))
        (call $drop (local.get 0))))
    (core instance $i (instantiate $m (with "" (instance
      (export "new" (func $new))
      (export "rep" (func $rep))
      (export "drop" (func $drop))))))
    (export $exported "thing" (type $thing))
    (func (export "[constructor]thing") (param "value" u32) (result (own $exported))
      (canon lift (core func $i "new")))
    (func (export "[static]thing.consume") (param "thing" (own $exported)) (result u32)
      (canon lift (core func $i "consume"))))
  (instance $api (instantiate $api (with "notify" (func $notify))))
  (export "api" (instance $api)))
"#;

/// A function whose type is `async`, although it is lifted synchronously.
const ASYNC_FUNCTION_TYPE: &str = r#"
(component
  (core module $m (func (export "run") (param i32) (result i32) local.get 0))
  (core instance $i (instantiate $m))
  (func (export "run") async (param "value" u32) (result u32)
    (canon lift (core func $i "run")))
  (func (export "other") (param "value" u32) (result u32)
    (canon lift (core func $i "run"))))
"#;

/// An asynchronous lift, next to a synchronous one.
const ASYNC_LIFT: &str = r#"
(component
  (core func $return (canon task.return (result u32)))
  (core module $m
    (import "" "return" (func $return (param i32)))
    (func (export "run") (param i32) (result i32)
      (call $return (local.get 0))
      i32.const 0)
    (func (export "callback") (param i32 i32 i32) (result i32) unreachable)
    (func (export "sync") (param i32) (result i32) local.get 0))
  (core instance $i (instantiate $m (with "" (instance (export "return" (func $return))))))
  (func (export "run") async (param "value" u32) (result u32)
    (canon lift (core func $i "run") async (callback (core func $i "callback"))))
  (func (export "sync") (param "value" u32) (result u32)
    (canon lift (core func $i "sync"))))
"#;

/// A synchronous function that is handed a future.
const FUTURE_TYPE: &str = r#"
(component
  (core module $m (func (export "run") (param i32) (result i32) local.get 0))
  (core instance $i (instantiate $m))
  (func (export "run") (param "value" (future)) (result u32)
    (canon lift (core func $i "run"))))
"#;

/// A core module that reads a context slot of the current thread.
const CONTEXT_SLOT: &str = r#"
(component
  (core func $get (canon context.get i32 0))
  (core module $m
    (import "" "get" (func $get (result i32)))
    (func (export "run") (param i32) (result i32) (call $get)))
  (core instance $i (instantiate $m (with "" (instance (export "get" (func $get))))))
  (func (export "run") (param "value" u32) (result u32)
    (canon lift (core func $i "run"))))
"#;

/// A core module that calls a built-in of the asynchronous ABI.
const BUILTIN: &str = r#"
(component
  (core func $new (canon waitable-set.new))
  (core module $m
    (import "" "new" (func $new (result i32)))
    (func (export "run") (param i32) (result i32) (call $new)))
  (core instance $i (instantiate $m (with "" (instance (export "new" (func $new))))))
  (func (export "run") (param "value" u32) (result u32)
    (canon lift (core func $i "run"))))
"#;

/// Two component instances, one calling the other through a fused adapter.
const TWO_INSTANCES: &str = r#"
(component
  (component $callee
    (core module $m (func (export "run") (param i32) (result i32) local.get 0))
    (core instance $i (instantiate $m))
    (func (export "run") (param "value" u32) (result u32)
      (canon lift (core func $i "run"))))
  (component $caller
    (import "callee" (func $callee (param "value" u32) (result u32)))
    (core func $lower (canon lower (func $callee)))
    (core module $m
      (import "" "callee" (func $callee (param i32) (result i32)))
      (func (export "run") (param i32) (result i32) (call $callee (local.get 0))))
    (core instance $i (instantiate $m (with "" (instance (export "callee" (func $lower))))))
    (func (export "run") (param "value" u32) (result u32)
      (canon lift (core func $i "run"))))
  (instance $callee (instantiate $callee))
  (instance $caller (instantiate $caller (with "callee" (func $callee "run"))))
  (export "run" (func $caller "run")))
"#;

/// A change to the configuration of a transpilation.
type Configure<'a> = &'a dyn Fn(&mut TranspileConfig);

/// Transpile a component.
fn transpile(
    wat: &str,
    configure: impl FnOnce(&mut TranspileConfig),
) -> (Transpiled, TranspileDiagnostics) {
    let component = wat::parse_str(wat).expect("fixture should be valid WAT");
    let opts = TranspileOpts {
        name: "component".into(),
        no_typescript: true,
        instantiation_mode: Some(InstantiationMode::Async),
        base64_cutoff: 0,
        ..Default::default()
    };
    let mut config = TranspileConfig::builder().opts(opts).build();
    configure(&mut config);

    transpile_with_diagnostics(&component, config).expect("fixture should transpile")
}

/// Generate the JavaScript bindings of a component.
fn bindings(wat: &str, configure: impl FnOnce(&mut TranspileConfig)) -> String {
    let (output, _) = transpile(wat, configure);
    let (_, source) = output
        .files
        .into_iter()
        .find(|(name, _)| name == "component.js")
        .expect("bindings should be generated");
    String::from_utf8(source).expect("bindings should be UTF-8")
}

/// The bindings of a component with the option off and on, under further configuration.
fn off_and_on(wat: &str, configure: impl Fn(&mut TranspileConfig)) -> (String, String) {
    let off = bindings(wat, &configure);
    let on = bindings(wat, |config| {
        configure(config);
        config.perf_sync_fast_path = true;
    });
    (off, on)
}

/// The source of the generated function `name`: from its declaration to the
/// first line that is indented as the declaration is and closes a block.
fn function<'a>(source: &'a str, name: &str) -> &'a str {
    let declaration = [
        format!("function {name}("),
        format!("const {name} = function("),
    ]
    .iter()
    .find_map(|declaration| source.find(declaration))
    .unwrap_or_else(|| panic!("no function [{name}] in the bindings"));

    let line_start = source[..declaration]
        .rfind('\n')
        .map_or(0, |newline| newline + 1);
    let closing = format!("\n{}}}", &source[line_start..declaration]);
    let body = &source[declaration..];
    let end = body
        .find(&closing)
        .unwrap_or_else(|| panic!("function [{name}] is not closed"));

    &body[..end]
}

/// Generated code without its spaces, which the source printer does not keep stable.
fn compact(source: &str) -> String {
    source.replace(' ', "")
}

/// Whether generated code creates or uses a task.
fn uses_task(source: &str) -> bool {
    source.contains("task.") || source.contains("createNewCurrentImplicitThread")
}

#[test]
fn option_is_off_by_default() {
    assert!(!TranspileConfig::default().perf_sync_fast_path);
}

#[test]
fn eligible_component_skips_the_task_machinery() {
    let (off, on) = off_and_on(ELIGIBLE, |_| {});
    assert_ne!(off, on);

    assert!(uses_task(function(&off, "run")));
    assert!(uses_task(function(&off, "_trampoline0")));

    // An export keeps every check that a caller can observe.
    let export = function(&on, "run");
    assert!(!uses_task(export), "{export}");
    assert!(export.contains(".throwIfTrapped();"), "{export}");
    assert!(export.contains(".markTrapped(err);"), "{export}");
    assert!(export.contains(".stopped) { throw "), "{export}");
    assert!(export.contains("_postReturnTrap("), "{export}");

    // An export fails with what a host function threw during its call, and
    // leaves the failure of the call it is nested in as it was.
    assert!(on.contains("let _jcoSyncCallFailure = null;"));
    assert!(!off.contains("_jcoSyncCallFailure"));
    assert!(
        export.contains("const callerFailure = _jcoSyncCallFailure;"),
        "{export}"
    );
    assert!(
        export.contains("if (_jcoSyncCallFailure !== null) { throw _jcoSyncCallFailure.error; }"),
        "{export}"
    );
    assert!(
        export.contains("_jcoSyncCallFailure = callerFailure;"),
        "{export}"
    );

    // The core module imports the generated import itself, which keeps the
    // checks of the wrappers it replaces.
    assert!(off.contains("_guardTrap(0, trampoline0, false)"));
    assert!(off.contains("let trampoline0 = _lowerImportBackwardsCompat.bind("));
    assert!(!on.contains("_guardTrap(0, trampoline0, false)"));
    assert!(on.contains("const trampoline0 = _trampoline0;"));
    let import = function(&on, "_trampoline0");
    assert!(!uses_task(import), "{import}");
    assert!(import.contains("_checkMayLeave("), "{import}");
    assert!(import.contains("_trackHostOperation("), "{import}");
    assert!(import.contains(".throwIfInterrupted();"), "{import}");
    assert!(import.contains("throw _recordTrap("), "{import}");
    assert!(
        compact(import).contains("_jcoSyncCallFailure={error:err};"),
        "{import}"
    );
}

#[test]
fn component_that_defines_a_resource_is_eligible() {
    let (off, on) = off_and_on(GUEST_RESOURCE, |_| {});
    assert_ne!(off, on);
    assert!(!on.contains("createNewCurrentImplicitThread("));

    // The built-ins of the resource and its destructor are generated as before.
    for source in [&off, &on] {
        assert!(source.contains("_guardMayLeave("));
        assert!(source.contains("exports0.dtor"));
    }
}

/// Bindings that import their runtime call its trap and `may_leave` checks
/// directly from the functions generated for imports.
#[cfg(feature = "external-runtime")]
#[test]
fn imported_runtime_provides_what_the_fast_path_calls() {
    let (off, on) = off_and_on(ELIGIBLE, |config| {
        config.cm_runtime_es_module = Some("@example/runtime".into());
    });
    assert_ne!(off, on);

    let import = function(&on, "_trampoline0");
    assert!(!uses_task(import), "{import}");
    for call in ["checkMayLeave(", "recordTrap(", "trackHostOperation("] {
        assert!(import.contains(call), "{call} in {import}");
    }
}

#[test]
fn eligible_component_keeps_resource_builtins_guarded() {
    let (off, on) = off_and_on(ELIGIBLE, |_| {});
    for source in [&off, &on] {
        assert!(source.contains("_guardMayLeave("));
    }
}

#[test]
fn ineligible_components_are_generated_as_without_the_option() {
    for (name, wat) in [
        ("async function type", ASYNC_FUNCTION_TYPE),
        ("async lift", ASYNC_LIFT),
        ("future type", FUTURE_TYPE),
        ("context slot", CONTEXT_SLOT),
        ("built-in", BUILTIN),
        ("two instances", TWO_INSTANCES),
    ] {
        let (off, on) = off_and_on(wat, |_| {});
        assert!(off == on, "{name}: bindings differ");
    }
}

#[test]
fn ineligible_configurations_are_generated_as_without_the_option() {
    let jspi = |config: &mut TranspileConfig| {
        config.opts.async_mode = Some(AsyncMode::JavaScriptPromiseIntegration {
            imports: vec!["host".into()],
            exports: Vec::new(),
        });
    };
    let cases: [(&str, Configure); 4] = [
        ("JSPI", &jspi),
        ("asm.js", &|config| config.opts.asmjs = true),
        ("call tracking", &|config| config.call_tracking = true),
        ("optimized import bindings", &|config| {
            config.opts.import_bindings = Some(BindingsMode::Optimized)
        }),
    ];
    for (name, configure) in cases {
        let (off, on) = off_and_on(ELIGIBLE, configure);
        assert!(off == on, "{name}: bindings differ");
    }
}

#[test]
fn jspi_without_async_functions_does_not_block() {
    let (off, on) = off_and_on(ELIGIBLE, |config| {
        config.opts.async_mode = Some(AsyncMode::JavaScriptPromiseIntegration {
            imports: Vec::new(),
            exports: Vec::new(),
        });
    });
    assert_ne!(off, on);
}

#[test]
fn diagnostics_preserve_the_transpiled_output() {
    let component = wat::parse_str(ELIGIBLE).unwrap();
    let config = TranspileConfig::builder()
        .call_tracking(true)
        .perf_sync_fast_path(true)
        .build();
    let Transpiled {
        files,
        imports,
        exports,
    } = transpile_with_config(&component, config.clone()).unwrap();
    let expected = Transpiled {
        files,
        imports,
        exports,
    };

    let (output, diagnostics) = transpile_with_diagnostics(&component, config).unwrap();
    assert_eq!(output.files, expected.files);
    assert_eq!(output.imports, expected.imports);
    assert!(output.exports == expected.exports);
    assert!(diagnostics.sync_fast_path_blocker.is_some());
}

#[test]
fn transpilation_reports_why_the_fast_path_is_not_used() {
    let blocker = |wat: &str, configure: Configure| {
        let (_, diagnostics) = transpile(wat, configure);
        diagnostics.sync_fast_path_blocker
    };
    let on = |config: &mut TranspileConfig| config.perf_sync_fast_path = true;
    assert_eq!(blocker(ELIGIBLE, &|_| {}), None, "not requested");
    assert_eq!(blocker(ELIGIBLE, &on), None, "eligible");
    assert_eq!(
        blocker(ELIGIBLE, &|config| {
            on(config);
            config.call_tracking = true;
        })
        .as_deref(),
        Some("call tracking is enabled")
    );
    assert_eq!(
        blocker(ELIGIBLE, &|config| config.call_tracking = true),
        None,
        "ineligible but not requested"
    );
}
