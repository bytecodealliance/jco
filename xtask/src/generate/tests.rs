use std::fs;
use xshell::{cmd, Shell};

// for debugging
const TRACE: bool = false;
const TEST_FILTER: &[&str] = &[];

const TEST_IGNORE: &[&str] = &[
    "nn_image_classification",
    "nn_image_classification_named",
    // http case
    "proxy_echo",
    // tcp
    "preview2_tcp_bind",
    "preview2_tcp_connect",
    "preview2_tcp_sample_application",
    "preview2_tcp_sockopts",
];

pub fn run() -> anyhow::Result<()> {
    let sh = Shell::new()?;

    // Compile wasmtime test programs
    let guard = sh.push_dir("submodules/wasmtime/crates/test-programs");
    cmd!(sh, "cargo build --target wasm32-wasi --release").run()?;
    drop(guard);

    // Tidy up the dir and recreate it.
    fs::remove_dir_all("./tests/generated")?;
    fs::create_dir_all("./tests/generated")?;
    fs::create_dir_all("./tests/rundir")?;

    let mut test_names = vec![];

    for entry in fs::read_dir("submodules/wasmtime/target/wasm32-wasi/release")? {
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
        let path = format!("submodules/wasmtime/target/wasm32-wasi/release/{test_name}.wasm");
        // compile into run dir
        let dest_file = format!("./tests/rundir/{test_name}.component.wasm");

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

        let content = generate_test(&test_name);
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
fn generate_test(test_name: &str) -> String {
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

    format!(
        r##"//! This file has been auto-generated, please do not modify manually
//! To regenerate this file re-run `cargo xtask generate tests` from the project root

use std::fs;
use xshell::{{cmd, Shell}};

#[test]
fn {test_name}() -> anyhow::Result<()> {{
    let sh = Shell::new()?;
    let wasi_file = "./tests/rundir/{test_name}.component.wasm";
    let _ = fs::remove_dir_all("./tests/rundir/{test_name}");

    let cmd = cmd!(sh, "node ./src/jco.js run {} --jco-dir ./tests/rundir/{test_name} --jco-import ./tests/virtualenvs/{virtual_env}.js {{wasi_file}} hello this '' 'is an argument' 'with 🚩 emoji'");
{}
    cmd.run(){};
    Ok(())
}}
"##,
        if TRACE { "--jco-trace" } else { "" },
        match stdin {
            Some(stdin) => format!("    let cmd = cmd.stdin(b\"{}\");", stdin),
            None => "".into(),
        },
        if !should_error {
            "?"
        } else {
            ".expect_err(\"test should exit with code 1\")"
        }
    )
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
