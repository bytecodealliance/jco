use std::fs;
use xshell::{cmd, Shell};

pub fn run() -> anyhow::Result<()> {
    let sh = Shell::new()?;

    // Compile wasmtime test programs
    let guard = sh.push_dir("submodules/wasmtime/crates/test-programs");
    cmd!(sh, "cargo build --target wasm32-wasi --release").run()?;
    drop(guard);

    // Make sure we have a dir to write to
    fs::create_dir_all("./tests/generated")?;

    let mut test_names = vec![];

    for entry in fs::read_dir("submodules/wasmtime/target/wasm32-wasi/release")? {
        let entry = entry?;

        // skip all files which don't end with `.wasm`
        if entry.path().extension().map(|p| p.to_str()).flatten() != Some("wasm") {
            continue;
        }

        let path = entry.path();
        let file_stem = path.file_stem();
        let path = match path.to_str() {
            Some(path) => path,
            None => continue,
        };
        let test_name = match file_stem.unwrap().to_str() {
            Some(path) => path,
            None => continue,
        };

        // only iterate over the `preview2` test programs
        if !path.contains("preview2") {
            continue;
        }

        test_names.push(test_name.to_owned());
        let content = generate_test(test_name);
        let file_name = format!("tests/generated/{test_name}.rs");
        fs::write(&file_name, content)?;
        eprintln!("wrote {file_name}");
    }

    let content = generate_mod(test_names.as_slice());
    let file_name = format!("tests/generated/mod.rs");
    fs::write(&file_name, content)?;
    eprintln!("wrote {file_name}");
    Ok(())
}

fn generate_test(test_name: &str) -> String {
    format!(
        r##"use tempdir::TempDir;
use xshell::{{cmd, Shell}};

#[test]
fn {test_name}() -> anyhow::Result<()> {{
    let sh = Shell::new()?;
    let file_name = "{test_name}";
    let tempdir = TempDir::new("{{file_name}}")?;
    let wasi_file = test_utils::compile(&sh, &tempdir, &file_name)?;
    cmd!(sh, "./src/jco.js run {{wasi_file}}").run()?;
    Ok(())
}}
    "##
    )
}

fn generate_mod(test_names: &[String]) -> String {
    test_names
        .into_iter()
        .map(|t| format!("mod {t};\n"))
        .collect()
}
