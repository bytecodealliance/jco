use std::fs;
use xshell::{cmd, Shell};

const TRACE: bool = false;

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

        let path = entry.path();
        let file_stem = path.file_stem();
        let test_name = match file_stem.unwrap().to_str() {
            Some(path) => path,
            None => continue,
        };

        test_names.push(test_name.to_owned());
        let content = generate_test(test_name);
        let file_name = format!("tests/generated/{test_name}.rs");
        fs::write(file_name, content)?;
    }

    test_names.sort();

    let content = generate_mod(test_names.as_slice());
    let file_name = "tests/generated/mod.rs";
    fs::write(file_name, content)?;
    println!("generated {} tests", test_names.len());
    Ok(())
}

/// Generate an individual test
fn generate_test(test_name: &str) -> String {
    let virtual_env = match test_name {
        "api_time" => "fakeclocks",
        "preview1_stdio_not_isatty" => "notty",
        "cli_file_append" => "bar-jabberwock",
        "api_proxy" | "api_proxy_streaming" => "http",
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

    let skip = match test_name {
        // these tests currently stall
        "api_read_only" | "preview1_path_open_read_write" => true,
        // pending testing
        "api_proxy" | "api_proxy_streaming" => true,
        _ => false,
    };

    let run_or_serve = match test_name {
        "api_proxy" | "api_proxy_streaming" => "serve",
        _ => "run",
    };

    let skip_comment = if skip { "// " } else { "" };
    format!(
        r##"//! This file has been auto-generated, please do not modify manually
//! To regenerate this file re-run `cargo xtask generate tests` from the project root

use std::fs;
{skip_comment}use tempdir::TempDir;
{skip_comment}use xshell::{{cmd, Shell}};

#[test]
fn {test_name}() -> anyhow::Result<()> {{
    {skip_comment}let sh = Shell::new()?;
    {skip_comment}let file_name = "{test_name}";
    {skip_comment}let tempdir = TempDir::new("{{file_name}}")?;
    {skip_comment}let wasi_file = test_utils::compile(&sh, &tempdir, &file_name)?;
    let _ = fs::remove_dir_all("./tests/rundir/{test_name}");

    {skip_comment}let cmd = cmd!(sh, "node ./src/jco.js {run_or_serve} {} --jco-dir ./tests/rundir/{test_name} --jco-import ./tests/virtualenvs/{virtual_env}.js {{wasi_file}} hello this '' 'is an argument' 'with 🚩 emoji'");
{}
    {skip_comment}cmd.run(){};
    {}Ok(())
}}
"##,
        if TRACE { "--jco-trace" } else { "" },
        match stdin {
            Some(stdin) => format!("    {skip_comment}let cmd = cmd.stdin(b\"{}\");", stdin),
            None => "".into(),
        },
        if !should_error {
            "?"
        } else {
            ".expect_err(\"test should exit with code 1\")"
        },
        if skip { "panic!(\"skipped\"); // " } else { "" }
    )
}

/// Generate the mod.rs file containing all tests
fn generate_mod(test_names: &[String]) -> String {
    use std::fmt::Write;

    test_names
        .iter()
        .fold(String::new(), |mut output, test_name| {
            let _ = write!(output, "mod {test_name};\n");
            output
        })
}
