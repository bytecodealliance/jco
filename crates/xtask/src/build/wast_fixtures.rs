use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::path::Path;

use anyhow::{Context as _, Result, ensure};

/// Convert a single WAST file
fn convert_wast_file(
    input_wast: &mut File,
    input_wast_path: &PathBuf,
    output_wasm: &mut File,
    output_js: &mut File,
) -> Result<()> {
    let mut contents = String::new();
    input_wast
        .read_to_string(&mut contents)
        .context("failed to read file")?;
    let parse_buf = wast::parser::ParseBuffer::new(&contents)?;
    let parsed = wast::parser::parse::<wast::Wast>(&parse_buf).with_context(|| {
        format!(
            "failed to parse wast directives from [{}]",
            input_wast_path.display()
        )
    })?;

    // TODO: write JS preamble

    for directive in parsed.directives {
        match directive {
            wast::WastDirective::Module(mut quote_wat) => {
                let encoded = quote_wat.encode().with_context(|| {
                    format!(
                        "failed to encode component in WAT [{}]",
                        input_wast_path.display()
                    )
                })?;
                output_wasm.write_all(&encoded).with_context(|| {
                    format!(
                        "failed to write component output in WAT [{}]",
                        input_wast_path.display()
                    )
                })?;
            }
            wast::WastDirective::ModuleDefinition(_) => {
                todo!("unsupported directive ModuleDefinition")
            }
            wast::WastDirective::ModuleInstance { .. } => {
                todo!("unsupported directive ModuleInstance")
            }
            wast::WastDirective::AssertMalformed { .. } => {
                todo!("unsupported directive AssertMalformed")
            }
            wast::WastDirective::AssertInvalid { .. } => {
                todo!("unsupported directive AssertInvalid")
            }
            wast::WastDirective::Register { .. } => {
                todo!("unsupported directive Register")
            }
            wast::WastDirective::Invoke(_) => todo!("unsupported directive Invoke"),
            wast::WastDirective::AssertTrap { .. } => todo!("unsupported directive AssertTrap"),
            wast::WastDirective::AssertReturn { .. } => todo!("unsupported directive AssertReturn"),
            wast::WastDirective::AssertExhaustion { .. } => {
                todo!("unsupported directive AssertExhaustion")
            }
            wast::WastDirective::AssertUnlinkable { .. } => {
                todo!("unsupported directive AssertUnlinkable")
            }
            wast::WastDirective::AssertException { .. } => {
                todo!("unsupported directive AssertException")
            }
            wast::WastDirective::AssertSuspension { .. } => {
                todo!("unsupported directive AssertSuspension")
            }
            wast::WastDirective::Thread(_) => todo!("unsupported directive Thread"),
            wast::WastDirective::Wait { .. } => todo!("unsupported directive Wait"),
        }
    }

    // TODO: output JS file
    Ok(())
}

/// Build WAST tests that can be used to test p3 host compliance
pub(crate) fn run(wast_path: &Path) -> Result<()> {
    let wast_path = wast_path.canonicalize().with_context(|| {
        format!(
            "failed to canonicalize wast file @ [{}]",
            wast_path.display()
        )
    })?;

    let mut input_wat = OpenOptions::new()
        .read(true)
        .open(&wast_path)
        .with_context(|| format!("failed to WAST file @ [{}]", wast_path.display()))?;
    ensure!(input_wat.metadata()?.is_file(), "wast path must be a file");

    let mut output_wasm_path = wast_path.clone();
    output_wasm_path.add_extension(".wasm");
    let mut output_wasm = OpenOptions::new()
        .write(true)
        .truncate(true)
        .open(output_wasm_path)?;

    let mut output_js_path = wast_path.clone();
    output_js_path.add_extension(".js");
    let mut output_js = OpenOptions::new()
        .write(true)
        .truncate(true)
        .open(output_js_path)?;

    convert_wast_file(&mut input_wat, &wast_path, &mut output_wasm, &mut output_js)?;

    Ok(())
}
