use anyhow::{Context as _, Result, bail, ensure};
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::path::Path;
use wast::core::WastRetCore;

/// Convert a single WAST file
fn convert_wast_file(
    input_wast: &mut File,
    input_wast_path: &Path,
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

    // Start exported test function
    writeln!(
        output_js,
        r#"
          export async function runWastTest(args) {{
              if (!args) {{ throw new Error('missing args'); }}
              if (!args.instance) {{ throw new Error('missing loaded wasm instance'); }}
              if (!args.assert) {{ throw new Error('missing assert obj'); }}
              const {{ instance, assert }} = args;
              let res;
        "#
    )?;

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
                output_wasm.flush()?;
            }
            wast::WastDirective::ModuleDefinition(_) => {
                bail!("unsupported directive ModuleDefinition")
            }
            wast::WastDirective::ModuleInstance { .. } => {
                bail!("unsupported directive ModuleInstance")
            }
            wast::WastDirective::AssertMalformed { .. } => {
                bail!("unsupported directive AssertMalformed")
            }
            wast::WastDirective::AssertInvalid { .. } => {
                bail!("unsupported directive AssertInvalid")
            }
            wast::WastDirective::Register { .. } => {
                bail!("unsupported directive Register")
            }
            wast::WastDirective::Invoke(_) => bail!("unsupported directive Invoke"),
            wast::WastDirective::AssertTrap { .. } => bail!("unsupported directive AssertTrap"),
            wast::WastDirective::AssertReturn { exec, results, .. } => {
                ensure!(
                    results.len() == 1,
                    "assert return with multiple results not yet supported"
                );
                // TODO: we need to check asyncness for await or not
                let (export_name, args) = extract_export_fn(&exec)?;
                let check_expr = match results.first() {
                    Some(ret) => {
                        format!("assert.strictEqual(res, {});", wast_ret_to_js_param(ret)?)
                    }
                    None => "".into(),
                };
                writeln!(
                    output_js,
                    r#"
                      res = await instance['{export_name}']({});
                      {check_expr}
                    "#,
                    args_to_js_params(args)?,
                )?;
            }
            wast::WastDirective::AssertExhaustion { .. } => {
                bail!("unsupported directive AssertExhaustion")
            }
            wast::WastDirective::AssertUnlinkable { .. } => {
                bail!("unsupported directive AssertUnlinkable")
            }
            wast::WastDirective::AssertException { .. } => {
                bail!("unsupported directive AssertException")
            }
            wast::WastDirective::AssertSuspension { .. } => {
                bail!("unsupported directive AssertSuspension")
            }
            wast::WastDirective::Thread(_) => bail!("unsupported directive Thread"),
            wast::WastDirective::Wait { .. } => bail!("unsupported directive Wait"),
        }
    }

    // Close out the function
    writeln!(output_js, "}}",)?;

    output_js.flush()?;
    Ok(())
}

/// Generate a list of JS params
fn args_to_js_params(args: &[wast::WastArg<'_>]) -> Result<String> {
    args.iter()
        .map(|arg| match arg {
            wast::WastArg::Core(v) => core_val_to_js_param(v),
            wast::WastArg::Component(v) => cm_val_to_js_param(v),
            _ => bail!("unsupported wast arg"),
        })
        .collect::<Result<Vec<String>>>()
        .map(|s| s.join(","))
}

/// Convert a Wast core value to a JS value
fn core_val_to_js_param(wast_arg: &wast::core::WastArgCore<'_>) -> Result<String> {
    match wast_arg {
        wast::core::WastArgCore::I32(v) => Ok(format!("{v}")),
        wast::core::WastArgCore::I64(v) => Ok(format!("{v}")),
        wast::core::WastArgCore::F32(v) => Ok(format!("{:.8}", f32::from_bits(v.bits))),
        wast::core::WastArgCore::F64(v) => Ok(format!("{:.8}", f64::from_bits(v.bits))),
        wast::core::WastArgCore::V128(v) => Ok(format!("{}", i128::from_le_bytes(v.to_le_bytes()))),
        wast::core::WastArgCore::RefNull(_) => bail!("refs unsupported core args"),
        wast::core::WastArgCore::RefExtern(_) => bail!("refs unsupported core args"),
        wast::core::WastArgCore::RefHost(_) => bail!("refs unsupported core args"),
    }
}

/// Convert a Wast return value to a JS value
fn wast_ret_to_js_param(wast_ret: &wast::WastRet<'_>) -> Result<String> {
    match wast_ret {
        wast::WastRet::Core(wast_ret_core) => wast_ret_core_val_to_js_param(wast_ret_core),
        wast::WastRet::Component(wast_val) => cm_val_to_js_param(wast_val),
        _ => bail!("unsupported wast ret"),
    }
}

/// Convert a Wast CM value to a JS value
fn wast_ret_core_val_to_js_param(wast_ret_core: &WastRetCore<'_>) -> Result<String> {
    match wast_ret_core {
        WastRetCore::I32(_) => bail!("WastRetCore::I32 not yet supported"),
        WastRetCore::I64(_) => bail!("WastRetCore::I64 not yet supported"),
        WastRetCore::F32(_nan_pattern) => bail!("WastRetCore::F32 not yet supported"),
        WastRetCore::F64(_nan_pattern) => bail!("WastRetCore::F64 not yet supported"),
        WastRetCore::V128(_v128_pattern) => bail!("WastRetCore::V128 not yet supported"),
        WastRetCore::RefNull(_heap_type) => bail!("WastRetCore::RefNull not yet supported"),
        WastRetCore::RefExtern(_) => bail!("WastRetCore::RefExtern not yet supported"),
        WastRetCore::RefHost(_) => bail!("WastRetCore::RefHost not yet supported"),
        WastRetCore::RefFunc(_index) => bail!("WastRetCore::RefFunc not yet supported"),
        WastRetCore::RefAny => bail!("WastRetCore::RefAny not yet supported"),
        WastRetCore::RefEq => bail!("WastRetCore::RefEq not yet supported"),
        WastRetCore::RefArray => bail!("WastRetCore::RefArray not yet supported"),
        WastRetCore::RefStruct => bail!("WastRetCore::RefStruct not yet supported"),
        WastRetCore::RefI31 => bail!("WastRetCore::RefI31 not yet supported"),
        WastRetCore::RefI31Shared => bail!("WastRetCore::RefI31Shared not yet supported"),
        WastRetCore::Either(_wast_ret_cores) => bail!("WastRetCore::Either not yet supported"),
    }
}

/// Convert a Wast CM value to a JS value
fn cm_val_to_js_param(wast_val: &wast::component::WastVal<'_>) -> Result<String> {
    match wast_val {
        wast::component::WastVal::Bool(v) => Ok(format!("{v}")),
        wast::component::WastVal::U8(v) => Ok(format!("{v}")),
        wast::component::WastVal::S8(v) => Ok(format!("{v}")),
        wast::component::WastVal::U16(v) => Ok(format!("{v}")),
        wast::component::WastVal::S16(v) => Ok(format!("{v}")),
        wast::component::WastVal::U32(v) => Ok(format!("{v}")),
        wast::component::WastVal::S32(v) => Ok(format!("{v}")),
        wast::component::WastVal::U64(v) => Ok(format!("{v}")),
        wast::component::WastVal::S64(v) => Ok(format!("{v}")),
        wast::component::WastVal::F32(v) => Ok(format!("{:.8}", f32::from_bits(v.bits))),
        wast::component::WastVal::F64(v) => Ok(format!("{:.8}", f64::from_bits(v.bits))),
        wast::component::WastVal::Char(v) => Ok(format!("'{v}'")),
        wast::component::WastVal::String(s) => Ok(format!("'{s}'")),
        wast::component::WastVal::List(vals) | wast::component::WastVal::Tuple(vals) => vals
            .iter()
            .map(|v| cm_val_to_js_param(v))
            .collect::<Result<Vec<String>>>()
            .map(|parts| parts.join(","))
            .map(|v| format!("[{v}]")),
        wast::component::WastVal::Record(items) => items
            .iter()
            .map(|(k, v)| cm_val_to_js_param(v).map(|v| format!("{k}: {v}")))
            .collect::<Result<Vec<String>>>()
            .map(|parts| parts.join(","))
            .map(|v| format!("{{{v}}}")),
        wast::component::WastVal::Variant(tag, wast_val) => match wast_val {
            Some(v) => cm_val_to_js_param(v).map(|v| format!("{{ tag: '{tag}', val: {v} }}")),
            None => Ok(format!("{{ tag: '{tag}', val: null }}")),
        },
        wast::component::WastVal::Enum(v) => Ok(format!("{{ tag: '{v}' }}")),
        wast::component::WastVal::Option(wast_val) => match wast_val {
            Some(v) => cm_val_to_js_param(v),
            None => Ok("null".into()),
        },
        wast::component::WastVal::Result(wast_val) => match wast_val {
            Ok(v) => match v {
                Some(v) => cm_val_to_js_param(v),
                None => Ok("{{ tag: 'ok', val: null }}".into()),
            },
            Err(e) => match e {
                Some(v) => cm_val_to_js_param(v),
                None => Ok("{{ tag: 'err', val: null }}".into()),
            },
        },
        wast::component::WastVal::Flags(items) => Ok(format!(
            "{{{}}}",
            items
                .iter()
                .map(|k| format!("{k}: true"))
                .collect::<Vec<String>>()
                .join(",")
        )),
    }
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
    output_wasm_path.add_extension("wasm");
    let mut output_wasm = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&output_wasm_path)
        .with_context(|| {
            format!(
                "failed to open output WASM file @ [{}]",
                output_wasm_path.display()
            )
        })?;

    let mut output_js_path = wast_path.clone();
    output_js_path.add_extension("js");
    let mut output_js = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(output_js_path)
        .with_context(|| format!("failed to open output JS file @ [{}]", wast_path.display()))?;

    convert_wast_file(&mut input_wat, &wast_path, &mut output_wasm, &mut output_js)?;

    Ok(())
}

/// Extract the export function from an Exec, along with it's results
fn extract_export_fn<'a>(
    exec: &'a wast::WastExecute,
) -> Result<(&'a str, &'a [wast::WastArg<'a>])> {
    match exec {
        wast::WastExecute::Invoke(wast::WastInvoke {
            module, name, args, ..
        }) => {
            ensure!(
                module.is_none(),
                "wast invocations with modules not yet supported"
            );
            Ok((*name, args))
        }
        wast::WastExecute::Wat(_) => bail!("unsupported wast execute type WastExecute::Wat"),
        wast::WastExecute::Get { .. } => bail!("unsupported wast execute type WastExecute::Get"),
    }
}
