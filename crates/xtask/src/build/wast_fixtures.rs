use anyhow::{Context as _, Result, bail, ensure};
use heck::ToLowerCamelCase;
use std::collections::HashMap;
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use wast::core::WastRetCore;

struct WastArtifact {
    file_name: String,
    kind: &'static str,
}

fn js_string(value: &str) -> Result<String> {
    serde_json::to_string(value).context("failed to encode JavaScript string")
}

fn js_export_name(name: &str) -> Result<String> {
    js_string(&name.to_lower_camel_case())
}

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
              if (!args.assert) {{ throw new Error('missing assert obj'); }}
              if (!args.expect) {{ throw new Error('missing expect obj'); }}
              if (!args.instantiate) {{ throw new Error('missing artifact instantiator'); }}
              const {{ instantiate, assert, expect }} = args;
              const namedInstances = new Map();
              let currentInstance;
              const getInstance = (name) => {{
                  const selected = name === null ? currentInstance : namedInstances.get(name);
                  if (!selected) {{
                      throw new Error(name === null ? 'missing current WAST instance' : `missing WAST instance $${{name}}`);
                  }}
                  return selected;
              }};
              let res;
        "#
    )?;

    let mut module_seen = false;
    let mut artifacts = Vec::new();
    let mut definitions = HashMap::new();
    for directive in parsed.directives {
        match directive {
            wast::WastDirective::Module(mut quote_wat) => {
                ensure!(
                    !module_seen,
                    "multiple module directives are not yet supported"
                );
                let definition_name = quote_wat.name().map(|id| id.name().to_owned());
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
                module_seen = true;

                let artifact_idx = artifacts.len();
                let mut artifact_path = PathBuf::from(input_wast_path);
                artifact_path.add_extension("wasm");
                artifacts.push(WastArtifact {
                    file_name: artifact_file_name(&artifact_path)?,
                    kind: encoded_kind(&encoded)?,
                });
                writeln!(
                    output_js,
                    "currentInstance = await instantiate(wastTestArtifacts[{artifact_idx}]);"
                )?;
                if let Some(name) = definition_name {
                    writeln!(
                        output_js,
                        "namedInstances.set({}, currentInstance);",
                        js_string(&name)?
                    )?;
                }
            }
            wast::WastDirective::ModuleDefinition(quote_wat) => {
                let definition_name = quote_wat.name().map(|id| id.name().to_owned());
                let artifact_idx = artifacts.len();
                artifacts.push(write_quote_artifact(
                    quote_wat,
                    input_wast_path,
                    artifact_idx,
                )?);
                register_definition(definition_name.as_deref(), artifact_idx, &mut definitions);
            }
            wast::WastDirective::ModuleInstance {
                instance, module, ..
            } => {
                let definition_name = module.map(|id| id.name().to_owned());
                let artifact_idx = *definitions.get(&definition_name).with_context(|| {
                    let name = definition_name
                        .as_deref()
                        .map_or("<unnamed>".to_owned(), |name| format!("${name}"));
                    format!("unknown WAST module/component definition {name}")
                })?;
                writeln!(
                    output_js,
                    "currentInstance = await instantiate(wastTestArtifacts[{artifact_idx}]);"
                )?;
                if let Some(instance) = instance {
                    writeln!(
                        output_js,
                        "namedInstances.set({}, currentInstance);",
                        js_string(instance.name())?
                    )?;
                }
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
            wast::WastDirective::Invoke(invoke) => {
                writeln!(
                    output_js,
                    "await getInstance({})[{}]({});",
                    invocation_instance_name(invoke.module)?,
                    js_export_name(invoke.name)?,
                    args_to_js_params(&invoke.args)?,
                )?;
            }
            wast::WastDirective::AssertTrap { exec, message, .. } => match exec {
                wast::WastExecute::Invoke(invoke) => {
                    writeln!(
                        output_js,
                        r#"
                              await expect(async () => getInstance({})[{}]({})).rejects.toThrow({});
                            "#,
                        invocation_instance_name(invoke.module)?,
                        js_export_name(invoke.name)?,
                        args_to_js_params(&invoke.args)?,
                        js_string(message)?,
                    )?;
                }
                wast::WastExecute::Wat(wat) => {
                    let artifact_idx = artifacts.len();
                    artifacts.push(write_inline_artifact(wat, input_wast_path, artifact_idx)?);
                    writeln!(
                        output_js,
                        r#"
                              await expect(() => instantiate(wastTestArtifacts[{artifact_idx}])).rejects.toThrow({});
                            "#,
                        js_string(message)?,
                    )?;
                }
                wast::WastExecute::Get { .. } => {
                    bail!("unsupported wast execute type WastExecute::Get")
                }
            },
            wast::WastDirective::AssertReturn { exec, results, .. } => {
                let invoke = extract_invoke(&exec)?;
                let expected = results
                    .iter()
                    .map(wast_ret_to_js_param)
                    .collect::<Result<Vec<_>>>()?;
                let check_expr = match expected.as_slice() {
                    [] => "assert.isUndefined(res);".into(),
                    [expected] => format!("assert.deepEqual(res, {expected});"),
                    expected => format!("assert.deepEqual(res, [{}]);", expected.join(",")),
                };
                writeln!(
                    output_js,
                    r#"
                      res = await getInstance({})[{}]({});
                      {check_expr}
                    "#,
                    invocation_instance_name(invoke.module)?,
                    js_export_name(invoke.name)?,
                    args_to_js_params(&invoke.args)?,
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
            wast::WastDirective::AssertInvalidCustom { .. } => {
                bail!("unsupported directive AssertInvalidCustom")
            }
            wast::WastDirective::AssertMalformedCustom { .. } => {
                bail!("unsupported directive AssertMalformedCustom")
            }
        }
    }

    ensure!(
        module_seen || !artifacts.is_empty(),
        "wast file did not contain an executable module or component"
    );

    // Close out the function
    writeln!(output_js, "}}",)?;
    writeln!(output_js, "export const wastTestRequiresInstance = false;")?;
    let artifact_metadata = artifacts
        .iter()
        .map(|artifact| {
            Ok(format!(
                "{{ path: {}, kind: {} }}",
                js_string(&artifact.file_name)?,
                js_string(artifact.kind)?,
            ))
        })
        .collect::<Result<Vec<_>>>()?;
    writeln!(
        output_js,
        "export const wastTestArtifacts = [{}];",
        artifact_metadata.join(", ")
    )?;

    output_js.flush()?;
    Ok(())
}

fn register_definition(
    name: Option<&str>,
    artifact_idx: usize,
    definitions: &mut HashMap<Option<String>, usize>,
) {
    definitions.insert(name.map(str::to_owned), artifact_idx);
}

fn invocation_instance_name(module: Option<wast::token::Id<'_>>) -> Result<String> {
    module.map_or_else(|| Ok("null".to_owned()), |id| js_string(id.name()))
}

fn artifact_file_name(artifact_path: &Path) -> Result<String> {
    Ok(artifact_path
        .file_name()
        .and_then(|name| name.to_str())
        .context("WAST artifact path was not valid UTF-8")?
        .to_owned())
}

fn encoded_kind(encoded: &[u8]) -> Result<&'static str> {
    match encoded.get(0..8) {
        Some(b"\0asm\x0d\0\x01\0") => Ok("component"),
        Some(b"\0asm\x01\0\0\0") => Ok("module"),
        _ => bail!("encoded WAT artifact has an unknown binary kind"),
    }
}

fn write_quote_artifact(
    mut quote_wat: wast::QuoteWat<'_>,
    input_wast_path: &Path,
    artifact_idx: usize,
) -> Result<WastArtifact> {
    let encoded = quote_wat.encode().with_context(|| {
        format!(
            "failed to encode WAT artifact in [{}]",
            input_wast_path.display()
        )
    })?;
    write_artifact(&encoded, input_wast_path, artifact_idx)
}

fn write_inline_artifact(
    mut wat: wast::Wat<'_>,
    input_wast_path: &Path,
    artifact_idx: usize,
) -> Result<WastArtifact> {
    let encoded = wat.encode().with_context(|| {
        format!(
            "failed to encode inline WAT artifact in [{}]",
            input_wast_path.display()
        )
    })?;
    write_artifact(&encoded, input_wast_path, artifact_idx)
}

fn write_artifact(
    encoded: &[u8],
    input_wast_path: &Path,
    artifact_idx: usize,
) -> Result<WastArtifact> {
    let kind = encoded_kind(encoded)?;
    let mut artifact_path = PathBuf::from(input_wast_path);
    artifact_path.set_extension(format!("wast.{artifact_idx}.wasm"));
    let mut artifact_file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&artifact_path)
        .with_context(|| {
            format!(
                "failed to open inline {kind} output [{}]",
                artifact_path.display()
            )
        })?;
    artifact_file.write_all(&encoded).with_context(|| {
        format!(
            "failed to write inline {kind} output [{}]",
            artifact_path.display()
        )
    })?;
    artifact_file.flush()?;

    Ok(WastArtifact {
        file_name: artifact_file_name(&artifact_path)?,
        kind,
    })
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
        wast::core::WastArgCore::I64(v) => Ok(format!("{v}n")),
        wast::core::WastArgCore::F32(v) => Ok(float_to_js(f32::from_bits(v.bits) as f64)),
        wast::core::WastArgCore::F64(v) => Ok(float_to_js(f64::from_bits(v.bits))),
        wast::core::WastArgCore::V128(_) => bail!("v128 unsupported core args"),
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
        WastRetCore::I32(v) => Ok(v.to_string()),
        WastRetCore::I64(v) => Ok(format!("{v}n")),
        WastRetCore::F32(wast::core::NanPattern::Value(v)) => {
            Ok(float_to_js(f32::from_bits(v.bits) as f64))
        }
        WastRetCore::F64(wast::core::NanPattern::Value(v)) => {
            Ok(float_to_js(f64::from_bits(v.bits)))
        }
        WastRetCore::F32(_) | WastRetCore::F64(_) => Ok("NaN".into()),
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

fn float_to_js(value: f64) -> String {
    if value.is_nan() {
        "NaN".into()
    } else if value == f64::INFINITY {
        "Infinity".into()
    } else if value == f64::NEG_INFINITY {
        "-Infinity".into()
    } else if value == 0.0 && value.is_sign_negative() {
        "-0".into()
    } else {
        format!("{value:?}")
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
        wast::component::WastVal::U64(v) => Ok(format!("{v}n")),
        wast::component::WastVal::S64(v) => Ok(format!("{v}n")),
        wast::component::WastVal::F32(v) => Ok(float_to_js(f32::from_bits(v.bits) as f64)),
        wast::component::WastVal::F64(v) => Ok(float_to_js(f64::from_bits(v.bits))),
        wast::component::WastVal::Char(v) => js_string(&v.to_string()),
        wast::component::WastVal::String(s) => js_string(s),
        wast::component::WastVal::List(vals) | wast::component::WastVal::Tuple(vals) => vals
            .iter()
            .map(|v| cm_val_to_js_param(v))
            .collect::<Result<Vec<String>>>()
            .map(|parts| parts.join(","))
            .map(|v| format!("[{v}]")),
        wast::component::WastVal::Record(items) => items
            .iter()
            .map(|(k, v)| Ok(format!("{}: {}", js_string(k)?, cm_val_to_js_param(v)?)))
            .collect::<Result<Vec<String>>>()
            .map(|parts| parts.join(","))
            .map(|v| format!("{{{v}}}")),
        wast::component::WastVal::Variant(tag, wast_val) => match wast_val {
            Some(v) => Ok(format!(
                "{{ tag: {}, val: {} }}",
                js_string(tag)?,
                cm_val_to_js_param(v)?
            )),
            None => Ok(format!("{{ tag: {} }}", js_string(tag)?)),
        },
        wast::component::WastVal::Enum(v) => Ok(format!("{{ tag: {} }}", js_string(v)?)),
        wast::component::WastVal::Option(wast_val) => match wast_val {
            Some(v) => Ok(format!(
                "{{ tag: 'some', val: {} }}",
                cm_val_to_js_param(v)?
            )),
            None => Ok("{ tag: 'none' }".into()),
        },
        wast::component::WastVal::Result(wast_val) => match wast_val {
            Ok(v) => match v {
                Some(v) => Ok(format!("{{ tag: 'ok', val: {} }}", cm_val_to_js_param(v)?)),
                None => Ok("{ tag: 'ok', val: undefined }".into()),
            },
            Err(e) => match e {
                Some(v) => Ok(format!("{{ tag: 'err', val: {} }}", cm_val_to_js_param(v)?)),
                None => Ok("{ tag: 'err', val: undefined }".into()),
            },
        },
        wast::component::WastVal::Flags(items) => Ok(format!(
            "{{{}}}",
            items
                .iter()
                .map(|k| js_string(k).map(|k| format!("{k}: true")))
                .collect::<Result<Vec<String>>>()?
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

/// Extract an invocation from an executable WAST directive.
fn extract_invoke<'a>(exec: &'a wast::WastExecute) -> Result<&'a wast::WastInvoke<'a>> {
    match exec {
        wast::WastExecute::Invoke(invoke) => Ok(invoke),
        wast::WastExecute::Wat(_) => bail!("unsupported wast execute type WastExecute::Wat"),
        wast::WastExecute::Get { .. } => bail!("unsupported wast execute type WastExecute::Get"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static NEXT_TEMP_DIR: AtomicUsize = AtomicUsize::new(0);

    fn with_wast_fixture<T>(source: &str, test: impl FnOnce(&Path) -> Result<T>) -> Result<T> {
        let fixture_dir = std::env::temp_dir().join(format!(
            "jco-wast-fixture-{}-{}",
            std::process::id(),
            NEXT_TEMP_DIR.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&fixture_dir)?;
        let wast_path = fixture_dir.join("fixture.wast");
        fs::write(&wast_path, source)?;
        let result = test(&wast_path);
        fs::remove_dir_all(fixture_dir)?;
        result
    }

    #[test]
    fn builds_component_and_javascript_assertions() -> Result<()> {
        with_wast_fixture(
            r#"
                (component
                    (core module $m
                        (func (export "run") (result i32) i32.const 42)
                        (func (export "trap") unreachable)
                    )
                    (core instance $i (instantiate $m))
                    (func (export "run") (result u32) (canon lift (core func $i "run")))
                    (func (export "trap") (canon lift (core func $i "trap")))
                )
                (invoke "run")
                (assert_return (invoke "run") (u32.const 42))
                (assert_trap (invoke "trap") "unreachable")
            "#,
            |wast_path| {
                run(wast_path)?;

                let wasm_path = wast_path.with_extension("wast.wasm");
                let script_path = wast_path.with_extension("wast.js");
                ensure!(
                    !fs::read(wasm_path)?.is_empty(),
                    "missing encoded component"
                );
                let script = fs::read_to_string(script_path)?;
                ensure!(
                    script.contains("currentInstance = await instantiate(wastTestArtifacts[0]);"),
                    "missing component instantiation"
                );
                ensure!(
                    script.contains("await getInstance(null)[\"run\"]();"),
                    "missing invoke assertion"
                );
                ensure!(
                    script.contains("assert.deepEqual(res, 42);"),
                    "missing return assertion"
                );
                ensure!(
                    script.contains("rejects.toThrow(\"unreachable\")"),
                    "missing trap assertion"
                );
                ensure!(
                    script.contains("export const wastTestRequiresInstance = false;"),
                    "primary component should be instantiated in directive order"
                );
                ensure!(
                    script.contains(
                        r#"export const wastTestArtifacts = [{ path: "fixture.wast.wasm", kind: "component" }];"#
                    ),
                    "missing primary component artifact metadata"
                );
                Ok(())
            },
        )
    }

    #[test]
    fn builds_named_definitions_instances_and_invocations_in_directive_order() -> Result<()> {
        with_wast_fixture(
            r#"
                (component definition $component-def
                    (core module $m (func (export "run")))
                    (core instance $i (instantiate $m))
                    (func (export "run") (canon lift (core func $i "run")))
                )
                (component instance $component-instance $component-def)
                (invoke $component-instance "run")
                (module definition $module-def
                    (func (export "run"))
                )
                (module instance $module-instance $module-def)
                (invoke $component-instance "run")
                (invoke "run")
                (component instance $second-component-instance $component-def)
                (invoke "run")
            "#,
            |wast_path| {
                run(wast_path)?;

                let component_path = wast_path.with_extension("wast.0.wasm");
                let module_path = wast_path.with_extension("wast.1.wasm");
                ensure!(
                    !fs::read(component_path)?.is_empty(),
                    "missing named component definition"
                );
                ensure!(
                    !fs::read(module_path)?.is_empty(),
                    "missing named module definition"
                );

                let script = fs::read_to_string(wast_path.with_extension("wast.js"))?;
                ensure!(
                    script.contains(
                        r#"{ path: "fixture.wast.0.wasm", kind: "component" }, { path: "fixture.wast.1.wasm", kind: "module" }"#
                    ),
                    "definitions were not encoded in directive order"
                );
                ensure!(
                    script
                        .match_indices("currentInstance = await instantiate(wastTestArtifacts[0]);")
                        .count()
                        == 2,
                    "component definition was not reusable"
                );
                ensure!(
                    script.contains("namedInstances.set(\"component-instance\", currentInstance);"),
                    "missing named component instance"
                );
                ensure!(
                    script.contains("namedInstances.set(\"module-instance\", currentInstance);"),
                    "missing named module instance"
                );
                ensure!(
                    script.contains("await getInstance(\"component-instance\")[\"run\"]();"),
                    "missing named invocation target"
                );
                ensure!(
                    script.contains("await getInstance(null)[\"run\"]();"),
                    "missing current-instance invocation target"
                );

                let first_component_instance = script
                    .find("namedInstances.set(\"component-instance\", currentInstance);")
                    .context("missing first component instance")?;
                let module_instance = script
                    .find("namedInstances.set(\"module-instance\", currentInstance);")
                    .context("missing module instance")?;
                let second_component_instance = script
                    .find("namedInstances.set(\"second-component-instance\", currentInstance);")
                    .context("missing second component instance")?;
                ensure!(
                    first_component_instance < module_instance
                        && module_instance < second_component_instance,
                    "instance directive ordering was not preserved"
                );
                Ok(())
            },
        )
    }

    #[test]
    fn builds_inline_wat_execution_artifacts_in_directive_order() -> Result<()> {
        with_wast_fixture(
            r#"
                (assert_trap (component) "component trap")
                (assert_trap
                    (module
                        (func $start unreachable)
                        (start $start)
                    )
                    "module trap"
                )
            "#,
            |wast_path| {
                run(wast_path)?;

                let component_path = wast_path.with_extension("wast.0.wasm");
                let module_path = wast_path.with_extension("wast.1.wasm");
                ensure!(
                    !fs::read(component_path)?.is_empty(),
                    "missing encoded inline component"
                );
                ensure!(
                    !fs::read(module_path)?.is_empty(),
                    "missing encoded inline module"
                );

                let script = fs::read_to_string(wast_path.with_extension("wast.js"))?;
                ensure!(
                    script.contains("export const wastTestRequiresInstance = false;"),
                    "inline-only WAST unexpectedly requires a primary instance"
                );
                ensure!(
                    script.contains(
                        r#"{ path: "fixture.wast.0.wasm", kind: "component" }, { path: "fixture.wast.1.wasm", kind: "module" }"#
                    ),
                    "missing inline artifact metadata"
                );
                let first = script
                    .find("instantiate(wastTestArtifacts[0])")
                    .context("missing first inline execution")?;
                let second = script
                    .find("instantiate(wastTestArtifacts[1])")
                    .context("missing second inline execution")?;
                ensure!(first < second, "inline execution order was not preserved");
                Ok(())
            },
        )
    }

    #[test]
    fn rejects_multiple_modules() -> Result<()> {
        with_wast_fixture("(component) (component)", |wast_path| {
            let err = run(wast_path).expect_err("multiple modules should fail");
            ensure!(
                err.to_string().contains("multiple module directives"),
                "unexpected error: {err:#}"
            );
            Ok(())
        })
    }

    #[test]
    fn renders_javascript_values() -> Result<()> {
        use wast::component::WastVal;

        assert_eq!(
            cm_val_to_js_param(&WastVal::U64(u64::MAX))?,
            "18446744073709551615n"
        );
        assert_eq!(
            cm_val_to_js_param(&WastVal::Option(None))?,
            "{ tag: 'none' }"
        );
        assert_eq!(
            cm_val_to_js_param(&WastVal::String("quote: \" and newline:\n"))?,
            r#""quote: \" and newline:\n""#
        );
        assert_eq!(float_to_js(f64::NEG_INFINITY), "-Infinity");
        assert_eq!(float_to_js(-0.0), "-0");
        assert_eq!(
            js_export_name("drop-readable-future-before-read")?,
            r#""dropReadableFutureBeforeRead""#
        );
        Ok(())
    }
}
