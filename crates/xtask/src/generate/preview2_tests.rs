use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::{fs, path::Path};

use anyhow::{Context, Result, anyhow};
use wit_component::ComponentEncoder;
use xshell::{Shell, cmd};

// for debugging
const TRACE: bool = false;
const DENO: bool = true;
const DEFAULT_TEST_FILTER: &[&str] = &[];

const DEFAULT_RETRIES: u32 = 5;

/// Tests that should be ignored
const TEST_IGNORE: &[&str] = &[
    // Wasmtime run supports a `wasmtime run --argv0=...` argument to customize the argv0
    // which this test assumes is being used. We don't support this feature.
    "cli_argv0",
    // We don't have interrupts.
    "cli_sleep_forever",
    // Don't currently support WASI config store.
    "config_get",
    "cli_serve_config",
    // TODO: Support these tests
    "cli_multiple_preopens",
];

/// We don't currently support these subsystems, but if someone wants to work on them we
/// can add these anytime!
const KEYWORD_IGNORE: &[&str] = &["nn_", "keyvalue", "runtime_config"];

const DENO_IGNORE: &[&str] = &[
    "api_read_only",
    "cli_directory_list",
    "cli_file_append",
    "cli_file_dir_sync",
    "cli_file_read",
    "cli_splice_stdin",
    "cli_stdin",
    "cli_stdin_empty",
    "cli_stdio_write_flushes",
    "http_outbound_request_get",
    "http_outbound_request_invalid_dnsname",
    "http_outbound_request_invalid_version",
    "http_outbound_request_large_post",
    "http_outbound_request_post",
    "http_outbound_request_put",
    "piped_multiple",
    "piped_polling",
    "piped_simple",
    "preview1_fd_filestat_set",
    "preview1_fd_flags_set",
    "preview1_fd_readdir",
    "preview1_file_pread_pwrite",
    "preview1_file_read_write",
    "preview1_file_seek_tell",
    "preview1_file_truncation",
    "preview1_file_unbuffered_write",
    "preview1_file_write",
    "preview1_interesting_paths",
    "preview1_nofollow_errors",
    "preview1_path_filestat",
    "preview1_path_open_lots",
    "preview1_path_open_read_write",
    "preview1_poll_oneoff_files",
    "preview1_remove_directory",
    "preview1_symlink_filestat",
    "preview1_unlink_file_trailing_slashes",
    "preview2_file_read_write",
    "preview2_sleep",
    "preview2_tcp_bind",
    "preview2_tcp_connect",
    "preview2_tcp_sample_application",
    "preview2_tcp_sockopts",
    "preview2_tcp_states",
    "preview2_tcp_streams",
    "preview2_udp_bind",
    "preview2_udp_connect",
    "preview2_udp_sample_application",
    "preview2_udp_states",
    "proxy_echo",
    "proxy_handler",
    "proxy_hash",
];

/// Tests that cannot be implemented on Windows
const TEST_IGNORE_WINDOWS: &[&str] = &[
    // openAt implementation should carry directory permissions through to nested
    // open calls. But our openAt implementation is currently path-based and not
    // proper segmented access based. If/when this changes we should be able to
    // support this.
    "api_read_only",
];

/// Tests that are known to be flaky in the imported & generated suite
const FLAKY_TESTS: &[&str] = &[
    // Flaky on multiple platforms, network access
    "preview2_tcp_streams",
    // Flaky on windows & ubuntu
    // error message encountered was some variation of "mtim should change"
    //
    // This likely points to a race in the impl that we should find & fix...
    "preview1_path_filestat",
    "preview1_path_filestat",
    "preview1_fd_filestat_set",
    "preview1_symlink_filestat",
    // Flaky on windows
    "preview2_udp_bind",
];

/// Build test programs that are organized as a cargo (work)space
pub fn build_test_programs(project_dir: impl AsRef<Path>, target: &str) -> Result<()> {
    let project_dir = project_dir.as_ref();
    let sh = Shell::new().context("failed to create shell for test program builds")?;
    let _guard = sh.push_dir(project_dir);
    cmd!(sh, "cargo build --target {target}")
        .run()
        .with_context(|| {
            format!(
                "failed to build {target} for dir [{}]",
                project_dir.display()
            )
        })?;
    Ok(())
}

pub fn run() -> Result<()> {
    let project_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../");

    // Compile wasmtime test programs
    let test_program_dir = project_dir.join("submodules/wasmtime/crates/test-programs");
    let target = "wasm32-wasip1";
    build_test_programs(test_program_dir, target)?;
    let output_dir = project_dir.join(format!("submodules/wasmtime/target/{target}/debug"));

    // Tidy up the dir and recreate it.
    let jco_crate_dir = project_dir.join("crates/jco");
    let _ = fs::remove_dir_all(jco_crate_dir.join("tests/generated"));
    let _ = fs::remove_dir_all(jco_crate_dir.join("tests/output"));
    fs::create_dir_all(jco_crate_dir.join("tests/generated"))
        .context("failed to recreate jco tests/generated dir")?;
    fs::create_dir_all(jco_crate_dir.join("tests/output"))
        .context("failed to recreate jco tests/output dir")?;
    fs::write(jco_crate_dir.join("tests/mod.rs"), "mod generated;\n")
        .context("failed to write generated test module")?;

    // Build a list of test names, one for every component
    let mut test_names = vec![];
    for entry in fs::read_dir(&output_dir)
        .with_context(|| format!("failed to read output directory [{}]", output_dir.display()))?
    {
        let entry = entry.context("failed to resolve dir entry")?;

        // Skip all files which don't end with `.wasm`
        if entry.path().extension().and_then(|p| p.to_str()) != Some("wasm") {
            continue;
        }

        let file_name = String::from(entry.file_name().to_str().unwrap());
        let test_name = String::from(&file_name[0..file_name.len() - 5]);

        if KEYWORD_IGNORE
            .iter()
            .any(|keyword_ignore| test_name.contains(keyword_ignore))
        {
            continue;
        }

        if TEST_IGNORE.contains(&test_name.as_ref()) {
            continue;
        }

        test_names.push(test_name);
    }
    test_names.sort();

    // Filter the test names if a filter was specified
    let filtered_tests = std::env::var("TEST_FILTER")
        .map(|v| v.split(",").map(|v| v.to_owned()).collect::<Vec<_>>())
        .unwrap_or_else(|_| DEFAULT_TEST_FILTER.iter().map(|s| s.to_string()).collect());
    if !filtered_tests.is_empty() {
        test_names = test_names
            .drain(..)
            .filter(|test_name| filtered_tests.contains(test_name))
            .collect::<Vec<String>>();
    }

    // Load the adapter
    let adapter_name = "wasi_snapshot_preview1";
    let adapter_path = project_dir.join(format!("packages/jco/lib/{adapter_name}.command.wasm"));
    let adapter_bytes = Arc::from(
        std::fs::read(&adapter_path)
            .with_context(|| format!("failed to read adapter @ [{}]", adapter_path.display()))?,
    );

    let output_module_path = jco_crate_dir.join("tests/generated/mod.rs");
    let jco_script_path = project_dir.join("packages/jco/src/jco.js");

    // Perform the tests
    let all_names = Arc::new(Mutex::new(Vec::new()));
    let jco_crate_dir = Arc::new(jco_crate_dir);
    let jco_script_path = Arc::new(jco_script_path);
    let mut handles = Vec::new();
    for test_name in test_names {
        let adapter_bytes = Arc::clone(&adapter_bytes);
        let all_names = Arc::clone(&all_names);
        let jco_crate_dir = Arc::clone(&jco_crate_dir);
        let jco_script_path = Arc::clone(&jco_script_path);

        let module_path = output_dir.join(format!("{test_name}.wasm"));
        let module_bytes = std::fs::read(&module_path)
            .with_context(|| format!("failed to read module @ [{}]", module_path.display()))?;

        let output_component_path =
            jco_crate_dir.join(format!("tests/generated/{test_name}.component.wasm"));

        // Encode and write out the bytes
        handles.push(std::thread::spawn(move || {
            let bytes = match ComponentEncoder::default()
                .validate(true)
                .module(&module_bytes)
                .context("failed to build module")?
                .adapter(adapter_name, &adapter_bytes)
                .context("failed to connect adapter")?
                .encode()
            {
                Ok(bytes) => bytes,
                Err(e) => {
                    eprintln!(
                        "failed to create component from module [{}]: {e}",
                        module_path
                            .file_name()
                            .and_then(|f| f.to_str())
                            .context("wasm module missing filename")?
                    );
                    return Ok(());
                }
            };
            std::fs::write(&output_component_path, bytes).with_context(|| {
                format!(
                    "failed to write out component to [{}]",
                    output_component_path.display(),
                )
            })?;

            if test_name == "api_proxy" || test_name == "api_proxy_streaming" {
                return Ok(());
            }

            let windows_skip = TEST_IGNORE_WINDOWS.contains(&test_name.as_ref());

            // Build the test to run
            let content = generate_test(GenerateTestArgs {
                test_name: &test_name,
                windows_skip,
                deno: false,
                jco_script_path: jco_script_path.as_path(),
                jco_crate_dir: jco_crate_dir.as_path(),
            })?;
            let test_file_path = jco_crate_dir.join(format!("tests/generated/node_{test_name}.rs"));
            fs::write(&test_file_path, content)?;

            // If deno tests are enabled, also write a deno test file out
            if DENO && !DENO_IGNORE.contains(&test_name.as_ref()) {
                let content = generate_test(GenerateTestArgs {
                    test_name: &test_name,
                    windows_skip: true,
                    deno: true,
                    jco_script_path: jco_script_path.as_path(),
                    jco_crate_dir: jco_crate_dir.as_path(),
                })?;
                let test_file_path =
                    jco_crate_dir.join(format!("tests/generated/deno_{test_name}.rs"));
                fs::write(&test_file_path, content)?;
                {
                    let mut all_names = all_names.lock().unwrap();
                    all_names.push(format!("deno_{test_name}"));
                }
            }

            {
                let mut all_names = all_names.lock().unwrap();
                all_names.push(format!("node_{test_name}"));
            }

            Ok(()) as anyhow::Result<()>
        }));
    }

    // Wait for all handles
    for handle in handles {
        let _ = handle.join().map_err(|e| anyhow!("{e:#?}"))?;
    }

    // Sort all names
    let mut all_names = all_names.lock().unwrap();
    all_names.sort();

    // Build out a rust module that contains all the generated tests written to disk
    let content = generate_mod(all_names.as_slice());
    fs::write(&output_module_path, content)?;
    eprintln!(
        "generated {} tests (see generated module @ [{}])",
        all_names.len(),
        output_module_path.canonicalize()?.display()
    );

    Ok(())
}

struct GenerateTestArgs<'a> {
    /// Name of the test
    test_name: &'a str,
    /// Whether to skip windows
    windows_skip: bool,
    /// Whether it's a deno test
    deno: bool,
    /// Path to Jco script (packages/jco/src/jco.js)
    jco_script_path: &'a Path,
    /// Path to Jco script (packages/jco/src/jco.js)
    jco_crate_dir: &'a Path,
}

/// Generate an individual test
fn generate_test(args: GenerateTestArgs<'_>) -> Result<String> {
    let GenerateTestArgs {
        test_name,
        windows_skip,
        deno,
        jco_script_path,
        jco_crate_dir,
    } = args;

    let piped = test_name.starts_with("piped_");

    // Determine the virtual environment to use for a given test
    let virtual_env = match test_name {
        "api_read_only" => "readonly",
        "api_time" => "fakeclocks",
        "cli_env" => "envtest",
        "cli_file_append" => "bar-jabberwock",
        "cli_no_ip_name_lookup" => "deny-dns",
        "cli_no_tcp" => "deny-tcp",
        "cli_no_udp" => "deny-udp",
        "preview1_stdio_not_isatty" => "notty",
        "proxy_echo" | "proxy_hash" => "server-api-proxy-streaming",
        "proxy_handler" => "server-api-proxy",
        "piped_simple" | "piped_multiple" | "piped_polling" => "piped",
        _ => {
            if test_name.starts_with("preview1") {
                "scratch"
            } else if test_name.starts_with("http_outbound") {
                "http"
            } else {
                "base"
            }
        }
    };

    let stdin = match test_name {
        "cli_stdin" => Some("So rested he by the Tumtum tree"),
        _ => None,
    };

    let should_error = matches!(
        test_name,
        "cli_exit_failure"
            | "cli_exit_with_code"
            | "cli_exit_panic"
            | "preview2_stream_pollable_traps"
            | "preview2_pollable_traps"
    );

    let maybe_include_write = if stdin.is_some() {
        "use std::io::prelude::Write;\n"
    } else {
        ""
    };

    // Determine file paths for component, tests
    let component_path = jco_crate_dir.join(format!("tests/generated/{test_name}.component.wasm"));

    // Build primary invocation for test
    let cmd1 = {
        let invocation = generate_command_invocation(GenerateCommandArgs {
            cmd_name: "cmd1",
            jco_script_path,
            jco_crate_dir,
            run_dir: &format!("{}{test_name}", if deno { "deno_" } else { "" }),
            virtual_env,
            stdin: if stdin.is_some() {
                Some("Stdio::piped()")
            } else {
                None
            },
            deno,
            component_path: &component_path,
        });

        let maybe_piped = if piped {
            "cmd1.stdout(Stdio::piped());\n"
        } else {
            ""
        };

        format!(
            r#"
{invocation}
{maybe_piped}
let mut _cmd1_child = cmd1.spawn().expect("failed to spawn test program");
"#
        )
    };

    // Build secondary command for consumer component (only if output needs to be piped)
    let mut cmd2: String = "".into();
    if piped {
        let invocation = generate_command_invocation(GenerateCommandArgs {
            cmd_name: "cmd2",
            jco_script_path,
            jco_crate_dir,
            component_path: &component_path,
            run_dir: &format!("{test_name}_consumer"),
            virtual_env: &format!("{virtual_env}-consumer"),
            stdin: None,
            deno,
        });
        cmd2 = format!(
            r#"
{invocation}
cmd2.stdin(_cmd1_child.stdout.take().unwrap());
let mut _cmd2_child = cmd2.spawn().expect("failed to spawn test program");
"#
        );
    };

    // Generate code for feature detection
    let windows_skip_prefix = if windows_skip {
        "#[cfg(not(windows))]"
    } else {
        Default::default()
    };
    let deno_prefix = if deno { "deno_" } else { Default::default() };
    let deno_test_file = format!(
        "{}",
        jco_crate_dir
            .join(format!("tests/rundir/{deno_prefix}{test_name}"))
            .display()
    );

    // Build code for reading stdin
    let mut stdin_read = String::new();
    if let Some(stdin) = stdin {
        stdin_read = format!(
            r#"_cmd1_child
            .stdin
            .as_ref()
            .unwrap()
            .write_all(b"{stdin}")
            .unwrap();
        "#
        );
    }

    // The core testing code that loads and uses the component
    let mut code = format!(
        r#"
        {cmd1}
        {cmd2}
        {stdin_read}
      "#,
    );

    // If this test is known to be flaky, wrap the test execution code in a retry mechanism
    if FLAKY_TESTS.contains(&test_name) {
        code = with_retry(WithRetryArgs {
            piped,
            should_error,
            retries: DEFAULT_RETRIES,
            original_src: &code,
        });
    } else {
        // If not using the retry mechanism, wait for the spawned process immediately,
        // ane ensure it succeeds
        code.push_str(&format!(
            r#"
    let status = match _cmd{piped_cmd_num}_child.wait() {{
        Ok(s) => s,
        Err(e) => {{
            anyhow::bail!("CHILD PROCESS ERROR: {{e:?}}\n");
        }}
    }};
    assert!({should_error}status.success(), "test execution failed");
    {piped_cleanup}

"#,
            piped_cmd_num = if piped { "2" } else { "1" },
            piped_cleanup = if piped { "_cmd1_child.wait()?;" } else { "" },
            should_error = if !should_error { "" } else { "!" },
        ));
    }

    let src = format!(
        r##"//! This file has been auto-generated, please do not modify manually
//! To regenerate this file re-run `cargo xtask generate tests` from the project root

use std::fs;
{maybe_include_write}use std::process::{{Command, Stdio}};

#[test]
{windows_skip_prefix}
fn {test_name}() -> anyhow::Result<()> {{
    let _ = fs::remove_dir_all(r#"{deno_test_file}"#);
    {code}
    Ok(())
}}
"##,
    );

    Ok(src)
}

struct GenerateCommandArgs<'a> {
    /// Command name
    cmd_name: &'a str,
    /// Path to JCO script (i.e. packages/jco/src/jco.js)
    jco_script_path: &'a Path,
    /// Path to the jco crate (i.e. crates/jco)
    jco_crate_dir: &'a Path,
    /// Path to the WASI component under text
    component_path: &'a Path,
    /// Directory to run in
    run_dir: &'a str,
    /// Virtual environment to use
    virtual_env: &'a str,
    /// stdin (if present)
    stdin: Option<&'a str>,
    /// Whether to use deno
    deno: bool,
}

fn generate_command_invocation(args: GenerateCommandArgs<'_>) -> String {
    let GenerateCommandArgs {
        cmd_name,
        jco_script_path,
        jco_crate_dir,
        run_dir,
        virtual_env,
        stdin,
        deno,
        component_path,
    } = args;
    let jco_script_path = format!("{}", jco_script_path.display());
    let rundir_path = format!(
        "{}",
        jco_crate_dir
            .join(format!("tests/rundir/{run_dir}"))
            .display()
    );
    let virtual_env_path = format!(
        "{}",
        jco_crate_dir
            .join(format!("tests/virtualenvs/{virtual_env}.mjs"))
            .display()
    );
    let import_map_path = format!(
        "{}",
        jco_crate_dir.join("tests/importmap.deno.json").display()
    );

    let trace = if TRACE {
        format!(
            "
        {cmd_name}.arg(\"--jco-trace\");"
        )
    } else {
        "".into()
    };

    let deno = if deno {
        format!(
            "
        {cmd_name}.env(\"JCO_RUN_PATH\", \"deno\")
            .env(\"JCO_RUN_ARGS\", r#\"run --importmap {import_map_path} -A\"#);"
        )
    } else {
        "".into()
    };

    let stdin_setting = stdin.unwrap_or("Stdio::null()");
    // NOTE: the jco script path needs to be relative to where this file is written
    format!(
        r##"let mut {cmd_name} = Command::new("node");
        {cmd_name}.arg(r#"{jco_script_path}"#);
        {cmd_name}.arg("run");
        {trace}
        {deno}
        {cmd_name}.arg("--jco-dir");
        {cmd_name}.arg(r#"{rundir_path}"#);
        {cmd_name}.arg("--jco-import");
        {cmd_name}.arg(r#"{virtual_env_path}"#);
        {cmd_name}.arg("--jco-import-bindings");
        {cmd_name}.arg("hybrid");
        {cmd_name}.arg(r#"{}"#);
        {cmd_name}.args(&["hello", "this", "", "is an argument", "with 🚩 emoji"]);
        {cmd_name}.stdin({stdin_setting});"##,
        component_path.display(),
    )
}

struct WithRetryArgs<'a> {
    /// Whether the generated output should be piped
    piped: bool,
    /// Whether test failures should generate errors
    should_error: bool,
    /// Number of times the retry should be attempted
    retries: u32,
    /// Core test code that will be wrapped to allow flaking
    original_src: &'a str,
}

/// Wrap provided test code with a shell that allows for retries
///
/// For tests that deal with external network access that are sometimes
/// flaky, we allow for a retry mechanism
fn with_retry<'a>(args: WithRetryArgs<'a>) -> String {
    let WithRetryArgs {
        piped,
        should_error,
        original_src,
        retries,
    } = args;

    let mut src = String::new();
    let piped_cmd_num = if piped { "2" } else { "1" };
    let should_error = if !should_error { "" } else { "!" };

    // Wrap the original test function in something repeatable
    //
    // We also add a few things to the original test function depending on how tests *should* be run:
    // - checking whether a child process failed
    // - allowing commands to fail (negative tests)
    //
    src.push_str(&format!(
        r#"
let test_run = || {{
    {original_src}

    let status = match _cmd{piped_cmd_num}_child.wait() {{
        Ok(s) => s,
        Err(e) => {{
            anyhow::bail!("CHILD PROCESS ERROR: {{e:?}}\n");
        }}
    }};

    if !{should_error}status.success() {{ anyhow::bail!("test execution failed, retrying..."); }}

    Ok(()) as anyhow::Result<()>
}};
"#
    ));

    // Build a retry loop to run the now-augmented original test
    src.push_str(&format!(
        r#"
let mut _passed = false;
for _n in 0..{retries}-1 {{
    if test_run().is_ok() {{
        _passed = true;
        return Ok(());
    }}
}}
anyhow::ensure!(_passed, "at least one test run passed");
"#
    ));

    src
}

/// Generate the mod.rs file containing all tests
fn generate_mod(test_names: &[String]) -> String {
    use std::fmt::Write;

    test_names
        .iter()
        .filter(|&name| name != "api_proxy" && name != "api_proxy_streaming")
        .fold(String::new(), |mut output, test_name| {
            let _ = writeln!(output, "mod {test_name};");
            output
        })
}
