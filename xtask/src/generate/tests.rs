use std::fs;
use xshell::{cmd, Shell};

// for debugging
const TRACE: bool = false;
const TEST_FILTER: &[&str] = &[];

const TEST_IGNORE: &[&str] = &["nn_image_classification", "nn_image_classification_named"];

// Tests that cannot be implemented on Windows
#[cfg(windows)]
const TEST_IGNORE_WINDOWS: &[&str] = &[
    // openAt implementation should carry directory permissions through to nested
    // open calls. But our openAt implementation is currently path-based and not
    // proper segmented access based. If/when this changes we should be able to
    // support this.
    "api_read_only",
];

pub fn run() -> anyhow::Result<()> {
    let sh = Shell::new()?;

    // Compile wasmtime test programs
    let guard = sh.push_dir("submodules/wasmtime/crates/test-programs");
    cmd!(sh, "cargo build --target wasm32-wasi").run()?;
    drop(guard);

    // Tidy up the dir and recreate it.
    let _ = fs::remove_dir_all("./tests/generated");
    let _ = fs::remove_dir_all("./tests/output");
    fs::create_dir_all("./tests/generated")?;
    fs::create_dir_all("./tests/output")?;
    fs::write("./tests/mod.rs", "mod generated;\n")?;

    let mut test_names = vec![];

    for entry in fs::read_dir("submodules/wasmtime/target/wasm32-wasi/debug")? {
        let entry = entry?;
        // skip all files which don't end with `.wasm`
        if entry.path().extension().and_then(|p| p.to_str()) != Some("wasm") {
            continue;
        }
        let file_name = String::from(entry.file_name().to_str().unwrap());
        let test_name = String::from(&file_name[0..file_name.len() - 5]);
        if TEST_IGNORE.contains(&test_name.as_ref()) {
            continue;
        }
        test_names.push(test_name);
    }
    test_names.sort();

    let test_names = if TEST_FILTER.len() > 0 {
        test_names
            .drain(..)
            .filter(|test_name| TEST_FILTER.contains(&test_name.as_ref()))
            .collect::<Vec<String>>()
    } else {
        test_names
    };

    for test_name in &test_names {
        let path = format!("submodules/wasmtime/target/wasm32-wasi/debug/{test_name}.wasm");
        // compile into generated dir
        let dest_file = format!("./tests/generated/{test_name}.component.wasm");

        if let Err(err) = cmd!(
            sh,
            "node ./src/jco.js new {path} --wasi-command -o {dest_file}"
        )
        .run()
        {
            dbg!(err);
            continue;
        }

        if test_name == "api_proxy" || test_name == "api_proxy_streaming" {
            continue;
        }

        #[cfg(windows)]
        let windows_skip = TEST_IGNORE_WINDOWS.contains(&test_name.as_ref());
        #[cfg(not(windows))]
        let windows_skip = false;

        let content = generate_test(&test_name, windows_skip);
        let file_name = format!("tests/generated/{test_name}.rs");
        fs::write(file_name, content)?;
    }

    let content = generate_mod(test_names.as_slice());
    let file_name = "tests/generated/mod.rs";
    fs::write(file_name, content)?;
    println!("generated {} tests", test_names.len());
    Ok(())
}

/// Generate an individual test
fn generate_test(test_name: &str, windows_skip: bool) -> String {
    let piped = test_name.starts_with("piped_");
    let virtual_env = match test_name {
        "api_read_only" => "readonly",
        "api_time" => "fakeclocks",
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

    let should_error = match test_name {
        "cli_exit_failure" | "cli_exit_panic" | "preview2_stream_pollable_traps" => true,
        _ => false,
    };

    let maybe_include_write = if stdin.is_some() {
        "use std::io::prelude::Write;\n"
    } else {
        ""
    };

    let cmd1 = format!(
        "{}{}
        let mut cmd1_child = cmd1.spawn().expect(\"failed to spawn test program\");",
        generate_command_invocation(
            "cmd1",
            test_name,
            virtual_env,
            if stdin.is_some() {
                Some("Stdio::piped()")
            } else {
                None
            },
        ),
        if piped {
            "
        cmd1.stdout(Stdio::piped());"
        } else {
            ""
        }
    );
    let cmd2: String = if piped {
        format!(
            "{}
        cmd2.stdin(cmd1_child.stdout.take().unwrap());
        let mut cmd2_child = cmd2.spawn().expect(\"failed to spawn test program\");
        ",
            generate_command_invocation(
                "cmd2",
                &format!("{test_name}_consumer"),
                &format!("{virtual_env}-consumer"),
                None,
            )
        )
    } else {
        "".into()
    };

    format!(
        r##"//! This file has been auto-generated, please do not modify manually
//! To regenerate this file re-run `cargo xtask generate tests` from the project root

use std::fs;
{maybe_include_write}use std::process::{{Command, Stdio}};

#[test]
fn {test_name}() -> anyhow::Result<()> {{
    {}{{
        let wasi_file = "./tests/generated/{test_name}.component.wasm";
        let _ = fs::remove_dir_all("./tests/rundir/{test_name}");
        {cmd1}
        {cmd2}{}let status = cmd{}_child.wait().expect("failed to wait on child");
        assert!({}status.success(), "test execution failed");
    }}
    Ok(())
}}
"##,
        if windows_skip {
            "#[cfg(not(windows))]\n    "
        } else {
            ""
        },
        match stdin {
            Some(stdin) => format!(
                "cmd1_child
            .stdin
            .as_ref()
            .unwrap()
            .write(b\"{}\")
            .unwrap();
        ",
                stdin
            ),
            None => "".into(),
        },
        if piped { "2" } else { "1" },
        if !should_error { "" } else { "!" },
    )
}

fn generate_command_invocation(
    cmd_name: &str,
    run_dir: &str,
    virtual_env: &str,
    stdin: Option<&str>,
) -> String {
    return format!(
        r##"let mut {cmd_name} = Command::new("node");
        {cmd_name}.arg("./src/jco.js");
        {cmd_name}.arg("run");
{}
        {cmd_name}.arg("--jco-dir");
        {cmd_name}.arg("./tests/rundir/{run_dir}");
        {cmd_name}.arg("--jco-import");
        {cmd_name}.arg("./tests/virtualenvs/{virtual_env}.js");
        {cmd_name}.arg(wasi_file);
        {cmd_name}.args(&["hello", "this", "", "is an argument", "with 🚩 emoji"]);
        {cmd_name}.stdin({});"##,
        if TRACE {
            format!("       {cmd_name}.arg(\"--jco-trace\");")
        } else {
            "".into()
        },
        match stdin {
            Some(stdin) => stdin,
            None => "Stdio::null()".into(),
        },
    );
}

/// Generate the mod.rs file containing all tests
fn generate_mod(test_names: &[String]) -> String {
    use std::fmt::Write;

    test_names
        .iter()
        .filter(|&name| name != "api_proxy" && name != "api_proxy_streaming")
        .fold(String::new(), |mut output, test_name| {
            let _ = write!(output, "mod {test_name};\n");
            output
        })
}
