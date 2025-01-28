use crate::intrinsics::Intrinsic;
use crate::source;
use crate::{uwrite, uwriteln};
use heck::*;
use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write;
use std::mem;
use wasmtime_environ::component::{ResourceIndex, TypeResourceTableIndex};
use wit_bindgen_core::abi::{Bindgen, Bitcast, Instruction};
use wit_component::StringEncoding;
use wit_parser::abi::WasmType;
use wit_parser::*;

#[derive(PartialEq)]
pub enum ErrHandling {
    None,
    ThrowResultErr,
    ResultCatchHandler,
}

#[derive(Clone, Debug, PartialEq)]
pub enum ResourceData {
    Host {
        tid: TypeResourceTableIndex,
        rid: ResourceIndex,
        local_name: String,
        dtor_name: Option<String>,
    },
    Guest {
        resource_name: String,
        prefix: Option<String>,
    },
}

///
/// Map used for resource function bindgen within a given component
///
/// Mapping from the instance + resource index in that component (internal or external)
/// to the unique global resource id used to key the resource tables for this resource.
///
/// The id value uniquely identifies the resource table so that if a resource is used
/// by n components, there should be n different indices and spaces in use. The map is
/// therefore entirely unique and fully distinct for each instance's function bindgen.
///
/// The second bool is true if it is an imported resource.
///
/// For a given resource table id {x}, with resource index {y} the local variables are assumed:
/// - handleTable{x}
/// - captureTable{y} (rep to instance map for captured imported tables, only for JS import bindgen,
///                    not hybrid)
/// - captureCnt{y} for assigning capture rep
///
/// For component-defined resources:
/// - finalizationRegistry{x}
///
/// handleTable internally will be allocated with { rep: i32, own: bool } entries
///
/// In the case of an imported resource tables, in place of "rep" we just store
/// the direct JS object being referenced, since in JS the object is its own handle.
///
///
#[derive(Clone, Debug, PartialEq)]
pub struct ResourceTable {
    pub imported: bool,
    pub data: ResourceData,
}
pub type ResourceMap = BTreeMap<TypeId, ResourceTable>;

pub struct FunctionBindgen<'a> {
    pub resource_map: &'a ResourceMap,
    pub cur_resource_borrows: bool,
    pub intrinsics: &'a mut BTreeSet<Intrinsic>,
    pub valid_lifting_optimization: bool,
    pub sizes: &'a SizeAlign,
    pub err: ErrHandling,
    pub tmp: usize,
    pub src: source::Source,
    pub block_storage: Vec<source::Source>,
    pub blocks: Vec<(String, Vec<String>)>,
    pub params: Vec<String>,
    pub memory: Option<&'a String>,
    pub realloc: Option<&'a String>,
    pub post_return: Option<&'a String>,
    pub tracing_prefix: Option<&'a String>,
    pub encoding: StringEncoding,
    pub callee: &'a str,
    pub callee_resource_dynamic: bool,
    pub resolve: &'a Resolve,
    pub is_async: bool,
}

impl FunctionBindgen<'_> {
    fn tmp(&mut self) -> usize {
        let ret = self.tmp;
        self.tmp += 1;
        ret
    }

    fn intrinsic(&mut self, intrinsic: Intrinsic) -> String {
        self.intrinsics.insert(intrinsic);
        intrinsic.name().to_string()
    }

    fn clamp_guest<T>(&mut self, results: &mut Vec<String>, operands: &[String], min: T, max: T)
    where
        T: std::fmt::Display,
    {
        let clamp = self.intrinsic(Intrinsic::ClampGuest);
        results.push(format!("{}({}, {}, {})", clamp, operands[0], min, max));
    }

    fn load(&mut self, method: &str, offset: i32, operands: &[String], results: &mut Vec<String>) {
        let view = self.intrinsic(Intrinsic::DataView);
        let memory = self.memory.as_ref().unwrap();
        results.push(format!(
            "{view}({memory}).{method}({} + {offset}, true)",
            operands[0],
        ));
    }

    fn store(&mut self, method: &str, offset: i32, operands: &[String]) {
        let view = self.intrinsic(Intrinsic::DataView);
        let memory = self.memory.as_ref().unwrap();
        uwriteln!(
            self.src,
            "{view}({memory}).{method}({} + {offset}, {}, true);",
            operands[1],
            operands[0]
        );
    }

    fn bind_results(&mut self, amt: usize, results: &mut Vec<String>) {
        match amt {
            0 => {}
            1 => {
                uwrite!(self.src, "const ret = ");
                results.push("ret".to_string());
            }
            n => {
                uwrite!(self.src, "var [");
                for i in 0..n {
                    if i > 0 {
                        uwrite!(self.src, ", ");
                    }
                    uwrite!(self.src, "ret{}", i);
                    results.push(format!("ret{}", i));
                }
                uwrite!(self.src, "] = ");
            }
        }
    }

    fn bitcast(&mut self, cast: &Bitcast, op: &str) -> String {
        match cast {
            Bitcast::I32ToF32 => {
                let cvt = self.intrinsic(Intrinsic::I32ToF32);
                format!("{cvt}({op})")
            }
            Bitcast::F32ToI32 => {
                let cvt = self.intrinsic(Intrinsic::F32ToI32);
                format!("{cvt}({op})")
            }
            Bitcast::I64ToF64 => {
                let cvt = self.intrinsic(Intrinsic::I64ToF64);
                format!("{cvt}({op})")
            }
            Bitcast::F64ToI64 => {
                let cvt = self.intrinsic(Intrinsic::F64ToI64);
                format!("{}({})", cvt, op)
            }
            Bitcast::I32ToI64 => format!("BigInt({op})"),
            Bitcast::I64ToI32 => format!("Number({op})"),
            Bitcast::I64ToF32 => {
                let cvt = self.intrinsic(Intrinsic::I32ToF32);
                format!("{cvt}(Number({op}))")
            }
            Bitcast::F32ToI64 => {
                let cvt = self.intrinsic(Intrinsic::F32ToI32);
                format!("BigInt({cvt}({op}))")
            }
            Bitcast::None
            | Bitcast::P64ToI64
            | Bitcast::LToI32
            | Bitcast::I32ToL
            | Bitcast::LToP
            | Bitcast::PToL
            | Bitcast::PToI32
            | Bitcast::I32ToP => op.to_string(),
            Bitcast::PToP64 | Bitcast::I64ToP64 | Bitcast::LToI64 => format!("BigInt({op})"),
            Bitcast::P64ToP | Bitcast::I64ToL => format!("Number({op})"),
            Bitcast::Sequence(casts) => {
                let mut statement = op.to_string();
                for cast in casts.iter() {
                    statement = self.bitcast(cast, &statement);
                }
                statement
            }
        }
    }
}

impl Bindgen for FunctionBindgen<'_> {
    type Operand = String;

    fn sizes(&self) -> &SizeAlign {
        self.sizes
    }

    fn push_block(&mut self) {
        let prev = mem::take(&mut self.src);
        self.block_storage.push(prev);
    }

    fn finish_block(&mut self, operands: &mut Vec<String>) {
        let to_restore = self.block_storage.pop().unwrap();
        let src = mem::replace(&mut self.src, to_restore);
        self.blocks.push((src.into(), mem::take(operands)));
    }

    fn return_pointer(&mut self, _size: usize, _align: usize) -> String {
        unimplemented!();
    }

    fn is_list_canonical(&self, resolve: &Resolve, ty: &Type) -> bool {
        array_ty(resolve, ty).is_some()
    }

    fn emit(
        &mut self,
        resolve: &Resolve,
        inst: &Instruction<'_>,
        operands: &mut Vec<String>,
        results: &mut Vec<String>,
    ) {
        match inst {
            Instruction::GetArg { nth } => results.push(self.params[*nth].clone()),
            Instruction::I32Const { val } => results.push(val.to_string()),
            Instruction::ConstZero { tys } => {
                for t in tys.iter() {
                    match t {
                        WasmType::I64 | WasmType::PointerOrI64 => results.push("0n".to_string()),
                        WasmType::I32
                        | WasmType::F32
                        | WasmType::F64
                        | WasmType::Pointer
                        | WasmType::Length => results.push("0".to_string()),
                    }
                }
            }

            // The representation of i32 in JS is a number, so 8/16-bit values
            // get further clamped to ensure that the upper bits aren't set when
            // we pass the value, ensuring that only the right number of bits
            // are transferred.
            Instruction::U8FromI32 => self.clamp_guest(results, operands, u8::MIN, u8::MAX),
            Instruction::S8FromI32 => self.clamp_guest(results, operands, i8::MIN, i8::MAX),
            Instruction::U16FromI32 => self.clamp_guest(results, operands, u16::MIN, u16::MAX),
            Instruction::S16FromI32 => self.clamp_guest(results, operands, i16::MIN, i16::MAX),
            // Use `>>>0` to ensure the bits of the number are treated as
            // unsigned.
            Instruction::U32FromI32 => results.push(format!("{} >>> 0", operands[0])),
            // All bigints coming from wasm are treated as signed, so convert
            // it to ensure it's treated as unsigned.
            Instruction::U64FromI64 => results.push(format!("BigInt.asUintN(64, {})", operands[0])),
            // Nothing to do signed->signed where the representations are the
            // same.
            Instruction::S32FromI32 | Instruction::S64FromI64 => {
                results.push(operands.pop().unwrap())
            }

            // All values coming from the host and going to wasm need to have
            // their ranges validated, since the host could give us any value.
            Instruction::I32FromU8 => {
                let conv = self.intrinsic(Intrinsic::ToUint8);
                results.push(format!("{conv}({op})", op = operands[0]))
            }
            Instruction::I32FromS8 => {
                let conv = self.intrinsic(Intrinsic::ToInt8);
                results.push(format!("{conv}({op})", op = operands[0]))
            }
            Instruction::I32FromU16 => {
                let conv = self.intrinsic(Intrinsic::ToUint16);
                results.push(format!("{conv}({op})", op = operands[0]))
            }
            Instruction::I32FromS16 => {
                let conv = self.intrinsic(Intrinsic::ToInt16);
                results.push(format!("{conv}({op})", op = operands[0]))
            }
            Instruction::I32FromU32 => {
                let conv = self.intrinsic(Intrinsic::ToUint32);
                results.push(format!("{conv}({op})", op = operands[0]))
            }
            Instruction::I32FromS32 => {
                let conv = self.intrinsic(Intrinsic::ToInt32);
                results.push(format!("{conv}({op})", op = operands[0]))
            }
            Instruction::I64FromU64 => {
                let conv = self.intrinsic(Intrinsic::ToBigUint64);
                results.push(format!("{conv}({op})", op = operands[0]))
            }
            Instruction::I64FromS64 => {
                let conv = self.intrinsic(Intrinsic::ToBigInt64);
                results.push(format!("{conv}({op})", op = operands[0]))
            }

            // The native representation in JS of f32 and f64 is just a number,
            // so there's nothing to do here. Everything wasm gives us is
            // representable in JS.
            Instruction::F32FromCoreF32 | Instruction::F64FromCoreF64 => {
                results.push(operands.pop().unwrap())
            }

            // Use a unary `+` to cast to a float.
            Instruction::CoreF32FromF32 | Instruction::CoreF64FromF64 => {
                results.push(format!("+{}", operands[0]))
            }

            // Validate that i32 values coming from wasm are indeed valid code
            // points.
            Instruction::CharFromI32 => {
                let validate = self.intrinsic(Intrinsic::ValidateGuestChar);
                results.push(format!("{}({})", validate, operands[0]));
            }

            // Validate that strings are indeed 1 character long and valid
            // unicode.
            Instruction::I32FromChar => {
                let validate = self.intrinsic(Intrinsic::ValidateHostChar);
                results.push(format!("{}({})", validate, operands[0]));
            }

            Instruction::Bitcasts { casts } => {
                for (cast, op) in casts.iter().zip(operands) {
                    results.push(self.bitcast(cast, op));
                }
            }

            Instruction::BoolFromI32 => {
                let tmp = self.tmp();
                uwrite!(self.src, "var bool{} = {};\n", tmp, operands[0]);
                if self.valid_lifting_optimization {
                    results.push(format!("!!bool{tmp}"));
                } else {
                    let throw = self.intrinsic(Intrinsic::ThrowInvalidBool);
                    results.push(format!(
                        "bool{tmp} == 0 ? false : (bool{tmp} == 1 ? true : {throw}())"
                    ));
                }
            }
            Instruction::I32FromBool => {
                results.push(format!("{} ? 1 : 0", operands[0]));
            }

            Instruction::RecordLower { record, .. } => {
                // use destructuring field access to get each
                // field individually.
                let tmp = self.tmp();
                let mut expr = "var {".to_string();
                for (i, field) in record.fields.iter().enumerate() {
                    if i > 0 {
                        expr.push_str(", ");
                    }
                    let name = format!("v{}_{}", tmp, i);
                    expr.push_str(&field.name.to_lower_camel_case());
                    expr.push_str(": ");
                    expr.push_str(&name);
                    results.push(name);
                }
                uwrite!(self.src, "{} }} = {};\n", expr, operands[0]);
            }

            Instruction::RecordLift { record, .. } => {
                // records are represented as plain objects, so we
                // make a new object and set all the fields with an object
                // literal.
                let mut result = "{\n".to_string();
                for (field, op) in record.fields.iter().zip(operands) {
                    result.push_str(&format!("{}: {},\n", field.name.to_lower_camel_case(), op));
                }
                result.push('}');
                results.push(result);
            }

            Instruction::TupleLower { tuple, .. } => {
                // Tuples are represented as an array, sowe can use
                // destructuring assignment to lower the tuple into its
                // components.
                let tmp = self.tmp();
                let mut expr = "var [".to_string();
                for i in 0..tuple.types.len() {
                    if i > 0 {
                        expr.push_str(", ");
                    }
                    let name = format!("tuple{}_{}", tmp, i);
                    expr.push_str(&name);
                    results.push(name);
                }
                uwrite!(self.src, "{}] = {};\n", expr, operands[0]);
            }

            Instruction::TupleLift { .. } => {
                // Tuples are represented as an array, so we just shove all
                // the operands into an array.
                results.push(format!("[{}]", operands.join(", ")));
            }

            // This lowers flags from a dictionary of booleans in accordance with https://webidl.spec.whatwg.org/#es-dictionary.
            Instruction::FlagsLower { flags, .. } => {
                let op0 = &operands[0];

                // Generate the result names.
                for _ in 0..flags.repr().count() {
                    let tmp = self.tmp();
                    let name = format!("flags{tmp}");
                    // Default to 0 so that in the null/undefined case, everything is false by
                    // default.
                    uwrite!(self.src, "let {name} = 0;\n");
                    results.push(name);
                }

                uwrite!(
                    self.src,
                    "if (typeof {op0} === 'object' && {op0} !== null) {{\n"
                );

                for (i, chunk) in flags.flags.chunks(32).enumerate() {
                    let result_name = &results[i];

                    uwrite!(self.src, "{result_name} = ");
                    for (i, flag) in chunk.iter().enumerate() {
                        if i != 0 {
                            uwrite!(self.src, " | ");
                        }

                        let flag = flag.name.to_lower_camel_case();
                        uwrite!(self.src, "Boolean({op0}.{flag}) << {i}");
                    }
                    uwrite!(self.src, ";\n");
                }

                uwrite!(
                    self.src,
                    "\
                    }} else if ({op0} !== null && {op0} !== undefined) {{
                        throw new TypeError('only an object, undefined or null can be converted to flags');
                    }}
                ");

                // We don't need to do anything else for the null/undefined
                // case, since that's interpreted as everything false, and we
                // already defaulted everyting to 0.
            }

            Instruction::FlagsLift { flags, .. } => {
                let tmp = self.tmp();
                results.push(format!("flags{tmp}"));

                if let Some(op) = operands.last() {
                    // We only need an extraneous bits check if the number of flags isn't a multiple
                    // of 32, because if it is then all the bits are used and there are no
                    // extraneous bits.
                    if flags.flags.len() % 32 != 0 && !self.valid_lifting_optimization {
                        let mask: u32 = 0xffffffff << (flags.flags.len() % 32);
                        uwriteln!(
                            self.src,
                            "if (({op} & {mask}) !== 0) {{
                                throw new TypeError('flags have extraneous bits set');
                            }}"
                        );
                    }
                }

                uwriteln!(self.src, "var flags{tmp} = {{");

                for (i, flag) in flags.flags.iter().enumerate() {
                    let flag = flag.name.to_lower_camel_case();
                    let op = &operands[i / 32];
                    let mask: u32 = 1 << (i % 32);
                    uwriteln!(self.src, "{flag}: Boolean({op} & {mask}),");
                }

                uwriteln!(self.src, "}};");
            }

            Instruction::VariantPayloadName => results.push("e".to_string()),

            Instruction::VariantLower {
                variant,
                results: result_types,
                name,
                ..
            } => {
                let blocks = self
                    .blocks
                    .drain(self.blocks.len() - variant.cases.len()..)
                    .collect::<Vec<_>>();
                let tmp = self.tmp();
                let op = &operands[0];
                uwriteln!(self.src, "var variant{tmp} = {op};");

                for i in 0..result_types.len() {
                    uwriteln!(self.src, "let variant{tmp}_{i};");
                    results.push(format!("variant{}_{}", tmp, i));
                }

                let expr_to_match = format!("variant{tmp}.tag");

                uwriteln!(self.src, "switch ({expr_to_match}) {{");
                for (case, (block, block_results)) in variant.cases.iter().zip(blocks) {
                    uwriteln!(self.src, "case '{}': {{", case.name.as_str());
                    if case.ty.is_some() {
                        uwriteln!(self.src, "const e = variant{tmp}.val;");
                    }
                    self.src.push_str(&block);

                    for (i, result) in block_results.iter().enumerate() {
                        uwriteln!(self.src, "variant{tmp}_{i} = {result};");
                    }
                    uwriteln!(
                        self.src,
                        "break;
                        }}"
                    );
                }
                let variant_name = name.to_upper_camel_case();
                uwriteln!(
                    self.src,
                    r#"default: {{
                        throw new TypeError(`invalid variant tag value \`${{JSON.stringify({expr_to_match})}}\` (received \`${{variant{tmp}}}\`) specified for \`{variant_name}\``);
                    }}"#,
                );
                uwriteln!(self.src, "}}");
            }

            Instruction::VariantLift { variant, name, .. } => {
                let blocks = self
                    .blocks
                    .drain(self.blocks.len() - variant.cases.len()..)
                    .collect::<Vec<_>>();

                let tmp = self.tmp();
                let op = &operands[0];

                uwriteln!(
                    self.src,
                    "let variant{tmp};
                    switch ({op}) {{"
                );

                for (i, (case, (block, block_results))) in
                    variant.cases.iter().zip(blocks).enumerate()
                {
                    let tag = case.name.as_str();
                    uwriteln!(
                        self.src,
                        "case {i}: {{
                            {block}\
                            variant{tmp} = {{
                                tag: '{tag}',"
                    );
                    if case.ty.is_some() {
                        assert!(block_results.len() == 1);
                        uwriteln!(self.src, "   val: {}", block_results[0]);
                    } else {
                        assert!(block_results.is_empty());
                    }
                    uwriteln!(
                        self.src,
                        "   }};
                        break;
                        }}"
                    );
                }
                let variant_name = name.to_upper_camel_case();
                if !self.valid_lifting_optimization {
                    uwriteln!(
                        self.src,
                        "default: {{
                            throw new TypeError('invalid variant discriminant for {variant_name}');
                        }}",
                    );
                }
                uwriteln!(self.src, "}}");
                results.push(format!("variant{}", tmp));
            }

            Instruction::OptionLower {
                payload,
                results: result_types,
                ..
            } => {
                let (mut some, some_results) = self.blocks.pop().unwrap();
                let (mut none, none_results) = self.blocks.pop().unwrap();

                let tmp = self.tmp();
                let op = &operands[0];
                uwriteln!(self.src, "var variant{tmp} = {op};");

                for i in 0..result_types.len() {
                    uwriteln!(self.src, "let variant{tmp}_{i};");
                    results.push(format!("variant{tmp}_{i}"));

                    let some_result = &some_results[i];
                    let none_result = &none_results[i];
                    uwriteln!(some, "variant{tmp}_{i} = {some_result};");
                    uwriteln!(none, "variant{tmp}_{i} = {none_result};");
                }

                if maybe_null(resolve, payload) {
                    uwriteln!(
                        self.src,
                        "switch (variant{tmp}.tag) {{
                            case 'none': {{
                                {none}\
                                break;
                            }}
                            case 'some': {{
                                const e = variant{tmp}.val;
                                {some}\
                                break;
                            }}
                            default: {{
                                throw new TypeError('invalid variant specified for option');
                            }}
                        }}",
                    );
                } else {
                    uwriteln!(
                        self.src,
                        "if (variant{tmp} === null || variant{tmp} === undefined) {{
                            {none}\
                        }} else {{
                            const e = variant{tmp};
                            {some}\
                        }}"
                    );
                }
            }

            Instruction::OptionLift { payload, .. } => {
                let (some, some_results) = self.blocks.pop().unwrap();
                let (none, none_results) = self.blocks.pop().unwrap();
                assert!(none_results.is_empty());
                assert!(some_results.len() == 1);
                let some_result = &some_results[0];

                let tmp = self.tmp();
                let op = &operands[0];

                let (v_none, v_some) = if maybe_null(resolve, payload) {
                    (
                        "{ tag: 'none' }",
                        format!(
                            "{{
                                tag: 'some',
                                val: {some_result}
                            }}"
                        ),
                    )
                } else {
                    ("undefined", some_result.into())
                };

                if !self.valid_lifting_optimization {
                    uwriteln!(
                        self.src,
                        "let variant{tmp};
                        switch ({op}) {{
                            case 0: {{
                                {none}\
                                variant{tmp} = {v_none};
                                break;
                            }}
                            case 1: {{
                                {some}\
                                variant{tmp} = {v_some};
                                break;
                            }}
                            default: {{
                                throw new TypeError('invalid variant discriminant for option');
                            }}
                        }}",
                    );
                } else {
                    uwriteln!(
                        self.src,
                        "let variant{tmp};
                        if ({op}) {{
                            {some}\
                            variant{tmp} = {v_some};
                        }} else {{
                            {none}\
                            variant{tmp} = {v_none};
                        }}"
                    );
                }

                results.push(format!("variant{tmp}"));
            }

            Instruction::ResultLower {
                results: result_types,
                ..
            } => {
                let (mut err, err_results) = self.blocks.pop().unwrap();
                let (mut ok, ok_results) = self.blocks.pop().unwrap();

                let tmp = self.tmp();
                let op = &operands[0];
                uwriteln!(self.src, "var variant{tmp} = {op};");

                for i in 0..result_types.len() {
                    uwriteln!(self.src, "let variant{tmp}_{i};");
                    results.push(format!("variant{tmp}_{i}"));

                    let ok_result = &ok_results[i];
                    let err_result = &err_results[i];
                    uwriteln!(ok, "variant{tmp}_{i} = {ok_result};");
                    uwriteln!(err, "variant{tmp}_{i} = {err_result};");
                }

                uwriteln!(
                    self.src,
                    "switch (variant{tmp}.tag) {{
                        case 'ok': {{
                            const e = variant{tmp}.val;
                            {ok}\
                            break;
                        }}
                        case 'err': {{
                            const e = variant{tmp}.val;
                            {err}\
                            break;
                        }}
                        default: {{
                            throw new TypeError('invalid variant specified for result');
                        }}
                    }}",
                );
            }

            Instruction::ResultLift { result, .. } => {
                let (err, err_results) = self.blocks.pop().unwrap();
                let (ok, ok_results) = self.blocks.pop().unwrap();
                let ok_result = if result.ok.is_some() {
                    assert_eq!(ok_results.len(), 1);
                    ok_results[0].to_string()
                } else {
                    assert_eq!(ok_results.len(), 0);
                    String::from("undefined")
                };
                let err_result = if result.err.is_some() {
                    assert_eq!(err_results.len(), 1);
                    err_results[0].to_string()
                } else {
                    assert_eq!(err_results.len(), 0);
                    String::from("undefined")
                };
                let tmp = self.tmp();
                let op0 = &operands[0];

                if !self.valid_lifting_optimization {
                    uwriteln!(
                        self.src,
                        "let variant{tmp};
                        switch ({op0}) {{
                            case 0: {{
                                {ok}\
                                variant{tmp} = {{
                                    tag: 'ok',
                                    val: {ok_result}
                                }};
                                break;
                            }}
                            case 1: {{
                                {err}\
                                variant{tmp} = {{
                                    tag: 'err',
                                    val: {err_result}
                                }};
                                break;
                            }}
                            default: {{
                                throw new TypeError('invalid variant discriminant for expected');
                            }}
                        }}",
                    );
                } else {
                    uwriteln!(
                        self.src,
                        "let variant{tmp};
                        if ({op0}) {{
                            {err}\
                            variant{tmp} = {{
                                tag: 'err',
                                val: {err_result}
                            }};
                        }} else {{
                            {ok}\
                            variant{tmp} = {{
                                tag: 'ok',
                                val: {ok_result}
                            }};
                        }}"
                    );
                }
                results.push(format!("variant{tmp}"));
            }

            // Lowers an enum in accordance with https://webidl.spec.whatwg.org/#es-enumeration.
            Instruction::EnumLower { name, enum_, .. } => {
                let tmp = self.tmp();

                let op = &operands[0];
                uwriteln!(self.src, "var val{tmp} = {op};");

                // Declare a variable to hold the result.
                uwriteln!(
                    self.src,
                    "let enum{tmp};
                    switch (val{tmp}) {{"
                );
                for (i, case) in enum_.cases.iter().enumerate() {
                    uwriteln!(
                        self.src,
                        "case '{case}': {{
                            enum{tmp} = {i};
                            break;
                        }}",
                        case = case.name
                    );
                }
                uwriteln!(self.src, "default: {{");
                if !self.valid_lifting_optimization {
                    uwriteln!(
                        self.src,
                        "if (({op}) instanceof Error) {{
                        console.error({op});
                    }}"
                    );
                }
                uwriteln!(
                    self.src,
                    "
                            throw new TypeError(`\"${{val{tmp}}}\" is not one of the cases of {name}`);
                        }}
                    }}",
                );

                results.push(format!("enum{tmp}"));
            }

            Instruction::EnumLift { name, enum_, .. } => {
                let tmp = self.tmp();

                uwriteln!(
                    self.src,
                    "let enum{tmp};
                    switch ({}) {{",
                    operands[0]
                );
                for (i, case) in enum_.cases.iter().enumerate() {
                    uwriteln!(
                        self.src,
                        "case {i}: {{
                            enum{tmp} = '{case}';
                            break;
                        }}",
                        case = case.name
                    );
                }
                if !self.valid_lifting_optimization {
                    let name = name.to_upper_camel_case();
                    uwriteln!(
                        self.src,
                        "default: {{
                            throw new TypeError('invalid discriminant specified for {name}');
                        }}",
                    );
                }
                uwriteln!(self.src, "}}");

                results.push(format!("enum{tmp}"));
            }

            Instruction::ListCanonLower { element, .. } => {
                let tmp = self.tmp();
                let memory = self.memory.as_ref().unwrap();
                let realloc = self.realloc.unwrap();

                let size = self.sizes.size(element).size_wasm32();
                let align = ArchitectureSize::from(self.sizes.align(element)).size_wasm32();
                uwriteln!(self.src, "var val{tmp} = {};", operands[0]);
                if matches!(element, Type::U8) {
                    uwriteln!(self.src, "var len{tmp} = val{tmp}.byteLength;");
                } else {
                    uwriteln!(self.src, "var len{tmp} = val{tmp}.length;");
                }

                uwriteln!(
                    self.src,
                    "var ptr{tmp} = {realloc}(0, 0, {align}, len{tmp} * {size});",
                );
                // TODO: this is the wrong endianness
                if matches!(element, Type::U8) {
                    uwriteln!(
                        self.src,
                        "var src{tmp} = new Uint8Array(val{tmp}.buffer || val{tmp}, val{tmp}.byteOffset, len{tmp} * {size});",
                    );
                } else {
                    uwriteln!(
                        self.src,
                        "var src{tmp} = new Uint8Array(val{tmp}.buffer, val{tmp}.byteOffset, len{tmp} * {size});",
                    );
                }
                uwriteln!(
                    self.src,
                    "(new Uint8Array({memory}.buffer, ptr{tmp}, len{tmp} * {size})).set(src{tmp});",
                );
                results.push(format!("ptr{}", tmp));
                results.push(format!("len{}", tmp));
            }
            Instruction::ListCanonLift { element, .. } => {
                let tmp = self.tmp();
                let memory = self.memory.as_ref().unwrap();
                uwriteln!(self.src, "var ptr{tmp} = {};", operands[0]);
                uwriteln!(self.src, "var len{tmp} = {};", operands[1]);
                // TODO: this is the wrong endianness
                let array_ty = array_ty(resolve, element).unwrap();
                uwriteln!(
                    self.src,
                    "var result{tmp} = new {array_ty}({memory}.buffer.slice(ptr{tmp}, ptr{tmp} + len{tmp} * {}));",
                    self.sizes.size(element).size_wasm32(),
                );
                results.push(format!("result{tmp}"));
            }
            Instruction::StringLower { .. } => {
                // Only Utf8 and Utf16 supported for now
                assert!(matches!(
                    self.encoding,
                    StringEncoding::UTF8 | StringEncoding::UTF16
                ));
                let intrinsic = if self.encoding == StringEncoding::UTF16 {
                    Intrinsic::Utf16Encode
                } else {
                    Intrinsic::Utf8Encode
                };
                let encode = self.intrinsic(intrinsic);
                let tmp = self.tmp();
                let memory = self.memory.as_ref().unwrap();
                let str = String::from("cabi_realloc");
                let realloc = self.realloc.unwrap_or(&str);
                uwriteln!(
                    self.src,
                    "var ptr{tmp} = {encode}({}, {realloc}, {memory});",
                    operands[0],
                );
                if self.encoding == StringEncoding::UTF8 {
                    let encoded_len = self.intrinsic(Intrinsic::Utf8EncodedLen);
                    uwriteln!(self.src, "var len{tmp} = {encoded_len};");
                } else {
                    uwriteln!(self.src, "var len{tmp} = {}.length;", operands[0]);
                }
                results.push(format!("ptr{}", tmp));
                results.push(format!("len{}", tmp));
            }
            Instruction::StringLift => {
                // Only Utf8 and Utf16 supported for now
                assert!(matches!(
                    self.encoding,
                    StringEncoding::UTF8 | StringEncoding::UTF16
                ));
                let intrinsic = if self.encoding == StringEncoding::UTF16 {
                    Intrinsic::Utf16Decoder
                } else {
                    Intrinsic::Utf8Decoder
                };
                let decoder = self.intrinsic(intrinsic);
                let tmp = self.tmp();
                let memory = self.memory.as_ref().unwrap();
                uwriteln!(self.src, "var ptr{tmp} = {};", operands[0]);
                uwriteln!(self.src, "var len{tmp} = {};", operands[1]);
                uwriteln!(
                    self.src,
                    "var result{tmp} = {decoder}.decode(new Uint{}Array({memory}.buffer, ptr{tmp}, len{tmp}));",
                    if self.encoding == StringEncoding::UTF16 { "16" } else { "8" }
                );
                results.push(format!("result{tmp}"));
            }

            Instruction::ListLower { element, .. } => {
                let (body, body_results) = self.blocks.pop().unwrap();
                assert!(body_results.is_empty());
                let tmp = self.tmp();
                let vec = format!("vec{}", tmp);
                let result = format!("result{}", tmp);
                let len = format!("len{}", tmp);
                let size = self.sizes.size(element).size_wasm32();
                let align = ArchitectureSize::from(self.sizes.align(element)).size_wasm32();

                // first store our vec-to-lower in a temporary since we'll
                // reference it multiple times.
                uwriteln!(self.src, "var {vec} = {};", operands[0]);
                uwriteln!(self.src, "var {len} = {vec}.length;");

                // ... then realloc space for the result in the guest module
                let realloc = self.realloc.as_ref().unwrap();
                uwriteln!(
                    self.src,
                    "var {result} = {realloc}(0, 0, {align}, {len} * {size});"
                );

                // ... then consume the vector and use the block to lower the
                // result.
                uwriteln!(self.src, "for (let i = 0; i < {vec}.length; i++) {{");
                uwriteln!(self.src, "const e = {vec}[i];");
                uwrite!(self.src, "const base = {result} + i * {size};");
                self.src.push_str(&body);
                uwrite!(self.src, "}}\n");

                results.push(result);
                results.push(len);
            }

            Instruction::ListLift { element, .. } => {
                let (body, body_results) = self.blocks.pop().unwrap();
                let tmp = self.tmp();
                let size = self.sizes.size(element).size_wasm32();
                let len = format!("len{tmp}");
                uwriteln!(self.src, "var {len} = {};", operands[1]);
                let base = format!("base{tmp}");
                uwriteln!(self.src, "var {base} = {};", operands[0]);
                let result = format!("result{tmp}");
                uwriteln!(self.src, "var {result} = [];");
                results.push(result.clone());

                uwriteln!(self.src, "for (let i = 0; i < {len}; i++) {{");
                uwriteln!(self.src, "const base = {base} + i * {size};");
                self.src.push_str(&body);
                assert_eq!(body_results.len(), 1);
                uwriteln!(self.src, "{result}.push({});", body_results[0]);
                uwrite!(self.src, "}}\n");
            }

            Instruction::IterElem { .. } => results.push("e".to_string()),

            Instruction::IterBasePointer => results.push("base".to_string()),

            Instruction::CallWasm { sig, .. } => {
                let sig_results_length = sig.results.len();
                self.bind_results(sig_results_length, results);
                let maybe_async_await = if self.is_async { "await " } else { "" };
                uwriteln!(
                    self.src,
                    "{maybe_async_await}{}({});",
                    self.callee,
                    operands.join(", ")
                );

                if let Some(prefix) = self.tracing_prefix {
                    let to_result_string = self.intrinsic(Intrinsic::ToResultString);
                    uwriteln!(
                        self.src,
                        "console.error(`{prefix} return {}`);",
                        if sig_results_length > 0 || !results.is_empty() {
                            format!("result=${{{to_result_string}(ret)}}")
                        } else {
                            "".to_string()
                        }
                    );
                }
            }

            Instruction::CallInterface { func } => {
                let results_length = func.results.len();
                let maybe_async_await = if self.is_async { "await " } else { "" };
                let call = if self.callee_resource_dynamic {
                    format!(
                        "{maybe_async_await}{}.{}({})",
                        operands[0],
                        self.callee,
                        operands[1..].join(", ")
                    )
                } else {
                    format!(
                        "{maybe_async_await}{}({})",
                        self.callee,
                        operands.join(", ")
                    )
                };
                if self.err == ErrHandling::ResultCatchHandler {
                    // result<_, string> allows JS error coercion only, while
                    // any other result type will trap for arbitrary JS errors.
                    let err_payload = if let (_, Some(Type::Id(err_ty))) =
                        func.results.throws(self.resolve).unwrap()
                    {
                        match &self.resolve.types[*err_ty].kind {
                            TypeDefKind::Type(Type::String) => {
                                self.intrinsic(Intrinsic::GetErrorPayloadString)
                            }
                            _ => self.intrinsic(Intrinsic::GetErrorPayload),
                        }
                    } else {
                        self.intrinsic(Intrinsic::GetErrorPayload)
                    };
                    uwriteln!(
                        self.src,
                        "let ret;
                        try {{
                            ret = {{ tag: 'ok', val: {call} }};
                        }} catch (e) {{
                            ret = {{ tag: 'err', val: {err_payload}(e) }};
                        }}",
                    );
                    results.push("ret".to_string());
                } else {
                    self.bind_results(results_length, results);
                    uwriteln!(self.src, "{call};");
                }

                if let Some(prefix) = self.tracing_prefix {
                    let to_result_string = self.intrinsic(Intrinsic::ToResultString);
                    uwriteln!(
                        self.src,
                        "console.error(`{prefix} return {}`);",
                        if results_length > 0 || !results.is_empty() {
                            format!("result=${{{to_result_string}(ret)}}")
                        } else {
                            "".to_string()
                        }
                    );
                }

                // After a high level call, we need to deactivate the component resource borrows.
                if self.cur_resource_borrows {
                    let symbol_resource_handle = self.intrinsic(Intrinsic::SymbolResourceHandle);
                    let cur_resource_borrows = self.intrinsic(Intrinsic::CurResourceBorrows);
                    let host = matches!(
                        self.resource_map.iter().nth(0).unwrap().1.data,
                        ResourceData::Host { .. }
                    );
                    if host {
                        uwriteln!(
                            self.src,
                            "for (const rsc of {cur_resource_borrows}) {{
                                rsc[{symbol_resource_handle}] = undefined;
                            }}
                            {cur_resource_borrows} = [];"
                        );
                    } else {
                        uwriteln!(
                            self.src,
                            "for (const {{ rsc, drop }} of {cur_resource_borrows}) {{
                                if (rsc[{symbol_resource_handle}]) {{
                                    drop(rsc[{symbol_resource_handle}]);
                                    rsc[{symbol_resource_handle}] = undefined;
                                }}
                            }}
                            {cur_resource_borrows} = [];"
                        );
                    }
                    self.cur_resource_borrows = false;
                }
            }

            Instruction::Return { amt, .. } => {
                if *amt == 0 {
                    if let Some(f) = &self.post_return {
                        uwriteln!(self.src, "{f}();");
                    }
                } else if *amt == 1 && self.err == ErrHandling::ThrowResultErr {
                    let component_err = self.intrinsic(Intrinsic::ComponentError);
                    let op = &operands[0];
                    uwriteln!(self.src, "const retVal = {op};");
                    if let Some(f) = &self.post_return {
                        uwriteln!(self.src, "{f}(ret);");
                    }
                    uwriteln!(
                        self.src,
                        "if (typeof retVal === 'object' && retVal.tag === 'err') {{
                            throw new {component_err}(retVal.val);
                        }}
                        return retVal.val;"
                    );
                } else {
                    let ret_assign = if self.post_return.is_some() {
                        "const retVal ="
                    } else {
                        "return"
                    };
                    if *amt == 1 {
                        uwriteln!(self.src, "{ret_assign} {};", operands[0]);
                    } else {
                        uwriteln!(self.src, "{ret_assign} [{}];", operands.join(", "));
                    }
                    if let Some(f) = &self.post_return {
                        uwriteln!(
                            self.src,
                            "{f}(ret);
                            return retVal;"
                        );
                    }
                }
            }

            Instruction::I32Load { offset } => self.load("getInt32", *offset, operands, results),
            Instruction::I64Load { offset } => self.load("getBigInt64", *offset, operands, results),
            Instruction::F32Load { offset } => self.load("getFloat32", *offset, operands, results),
            Instruction::F64Load { offset } => self.load("getFloat64", *offset, operands, results),
            Instruction::I32Load8U { offset } => self.load("getUint8", *offset, operands, results),
            Instruction::I32Load8S { offset } => self.load("getInt8", *offset, operands, results),
            Instruction::I32Load16U { offset } => {
                self.load("getUint16", *offset, operands, results)
            }
            Instruction::I32Load16S { offset } => self.load("getInt16", *offset, operands, results),
            Instruction::I32Store { offset } => self.store("setInt32", *offset, operands),
            Instruction::I64Store { offset } => self.store("setBigInt64", *offset, operands),
            Instruction::F32Store { offset } => self.store("setFloat32", *offset, operands),
            Instruction::F64Store { offset } => self.store("setFloat64", *offset, operands),
            Instruction::I32Store8 { offset } => self.store("setInt8", *offset, operands),
            Instruction::I32Store16 { offset } => self.store("setInt16", *offset, operands),

            Instruction::LengthStore { offset } => self.store("setInt32", *offset, operands),
            Instruction::LengthLoad { offset } => self.load("getInt32", *offset, operands, results),
            Instruction::PointerStore { offset } => self.store("setInt32", *offset, operands),
            Instruction::PointerLoad { offset } => {
                self.load("getInt32", *offset, operands, results)
            }

            Instruction::Malloc { size, align, .. } => {
                let tmp = self.tmp();
                let realloc = self.realloc.as_ref().unwrap();
                let ptr = format!("ptr{tmp}");
                uwriteln!(self.src, "var {ptr} = {realloc}(0, 0, {align}, {size});",);
                results.push(ptr);
            }

            Instruction::HandleLift { handle, .. } => {
                let (Handle::Own(ty) | Handle::Borrow(ty)) = handle;
                let resource_ty = &crate::dealias(self.resolve, *ty);
                let ResourceTable { imported, data } = &self.resource_map[resource_ty];

                let is_own = matches!(handle, Handle::Own(_));
                let rsc = format!("rsc{}", self.tmp());
                let handle = format!("handle{}", self.tmp());
                uwriteln!(self.src, "var {handle} = {};", &operands[0]);

                match data {
                    ResourceData::Host {
                        tid,
                        rid,
                        local_name,
                        dtor_name,
                    } => {
                        let tid = tid.as_u32();
                        let rid = rid.as_u32();
                        let symbol_dispose = self.intrinsic(Intrinsic::SymbolDispose);
                        let rsc_table_remove = self.intrinsic(Intrinsic::ResourceTableRemove);
                        let rsc_flag = self.intrinsic(Intrinsic::ResourceTableFlag);
                        if !imported {
                            let symbol_resource_handle =
                                self.intrinsic(Intrinsic::SymbolResourceHandle);
                            uwriteln!(self.src, "var {rsc} = new.target === {local_name} ? this : Object.create({local_name}.prototype);");
                            if is_own {
                                // Sending an own handle out to JS as a return value - set up finalizer and disposal.
                                let empty_func = self.intrinsic(Intrinsic::EmptyFunc);
                                uwriteln!(self.src,
                                    "Object.defineProperty({rsc}, {symbol_resource_handle}, {{ writable: true, value: {handle} }});
                                    finalizationRegistry{tid}.register({rsc}, {handle}, {rsc});");
                                if let Some(dtor) = dtor_name {
                                    // The Symbol.dispose function gets disabled on drop, so we can rely on the own handle remaining valid.
                                    uwriteln!(
                                        self.src,
                                        "Object.defineProperty({rsc}, {symbol_dispose}, {{ writable: true, value: function () {{
                                            finalizationRegistry{tid}.unregister({rsc});
                                            {rsc_table_remove}(handleTable{tid}, {handle});
                                            {rsc}[{symbol_dispose}] = {empty_func};
                                            {rsc}[{symbol_resource_handle}] = undefined;
                                            {dtor}(handleTable{tid}[({handle} << 1) + 1] & ~{rsc_flag});
                                        }}}});"
                                    );
                                } else {
                                    // Set up Symbol.dispose for borrows to allow its call, even though it does nothing.
                                    uwriteln!(
                                        self.src,
                                        "Object.defineProperty({rsc}, {symbol_dispose}, {{ writable: true, value: {empty_func} }});",
                                    );
                                }
                            } else {
                                // Borrow handles of local resources have rep handles, which we carry through here.
                                uwriteln!(self.src, "Object.defineProperty({rsc}, {symbol_resource_handle}, {{ writable: true, value: {handle} }});");
                            }
                        } else {
                            let rep = format!("rep{}", self.tmp());
                            // Imported handles either lift as instance capture from a previous lowering,
                            // or we create a new JS class to represent it.
                            let symbol_resource_rep = self.intrinsic(Intrinsic::SymbolResourceRep);
                            let symbol_resource_handle =
                                self.intrinsic(Intrinsic::SymbolResourceHandle);
                            uwriteln!(self.src,
                                "var {rep} = handleTable{tid}[({handle} << 1) + 1] & ~{rsc_flag};
                                var {rsc} = captureTable{rid}.get({rep});
                                if (!{rsc}) {{
                                    {rsc} = Object.create({local_name}.prototype);
                                    Object.defineProperty({rsc}, {symbol_resource_handle}, {{ writable: true, value: {handle} }});
                                    Object.defineProperty({rsc}, {symbol_resource_rep}, {{ writable: true, value: {rep} }});
                                }}"
                            );
                            if is_own {
                                // An own lifting is a transfer to JS, so existing own handle is implicitly dropped.
                                uwriteln!(
                                    self.src,
                                    "else {{
                                        captureTable{rid}.delete({rep});
                                    }}
                                    {rsc_table_remove}(handleTable{tid}, {handle});"
                                );
                            }
                        }

                        // Borrow handles are tracked to release after the call by CallInterface.
                        if !is_own {
                            let cur_resource_borrows =
                                self.intrinsic(Intrinsic::CurResourceBorrows);
                            uwriteln!(self.src, "{cur_resource_borrows}.push({rsc});");
                            self.cur_resource_borrows = true;
                        }
                    }

                    ResourceData::Guest {
                        resource_name,
                        prefix,
                    } => {
                        let symbol_resource_handle =
                            self.intrinsic(Intrinsic::SymbolResourceHandle);
                        let prefix = prefix.as_deref().unwrap_or("");
                        let lower_camel = resource_name.to_lower_camel_case();

                        if !imported {
                            if is_own {
                                uwriteln!(self.src, "var {rsc} = repTable.get($resource_{prefix}rep${lower_camel}({handle})).rep;");
                                uwrite!(
                                    self.src,
                                    "repTable.delete({handle});
                                     delete {rsc}[{symbol_resource_handle}];
                                     finalizationRegistry_export${prefix}{lower_camel}.unregister({rsc});
                                    "
                                );
                            } else {
                                uwriteln!(self.src, "var {rsc} = repTable.get({handle}).rep;");
                            }
                        } else {
                            let upper_camel = resource_name.to_upper_camel_case();

                            uwrite!(
                                self.src,
                                "var {rsc} = new.target === import_{prefix}{upper_camel} ? this : Object.create(import_{prefix}{upper_camel}.prototype);
                                 Object.defineProperty({rsc}, {symbol_resource_handle}, {{ writable: true, value: {handle} }});
                                "
                            );

                            uwriteln!(
                                self.src,
                                "finalizationRegistry_import${prefix}{lower_camel}.register({rsc}, {handle}, {rsc});",
                            );

                            if !is_own {
                                let cur_resource_borrows =
                                    self.intrinsic(Intrinsic::CurResourceBorrows);
                                uwriteln!(self.src, "{cur_resource_borrows}.push({{ rsc: {rsc}, drop: $resource_import${prefix}drop${lower_camel} }});");
                                self.cur_resource_borrows = true;
                            }
                        }
                    }
                }
                results.push(rsc);
            }

            Instruction::HandleLower { handle, name, .. } => {
                let (Handle::Own(ty) | Handle::Borrow(ty)) = handle;
                let is_own = matches!(handle, Handle::Own(_));
                let ResourceTable { imported, data } =
                    &self.resource_map[&crate::dealias(self.resolve, *ty)];

                let class_name = name.to_upper_camel_case();
                let handle = format!("handle{}", self.tmp());
                let symbol_resource_handle = self.intrinsic(Intrinsic::SymbolResourceHandle);
                let symbol_dispose = self.intrinsic(Intrinsic::SymbolDispose);
                let op = &operands[0];

                match data {
                    ResourceData::Host {
                        tid,
                        rid,
                        local_name,
                        ..
                    } => {
                        let tid = tid.as_u32();
                        let rid = rid.as_u32();
                        if !imported {
                            if is_own {
                                let empty_func = self.intrinsic(Intrinsic::EmptyFunc);
                                uwriteln!(
                                    self.src,
                                    "var {handle} = {op}[{symbol_resource_handle}];
                                    if (!{handle}) {{
                                        throw new TypeError('Resource error: Not a valid \"{class_name}\" resource.');
                                    }}
                                    finalizationRegistry{tid}.unregister({op});
                                    {op}[{symbol_dispose}] = {empty_func};
                                    {op}[{symbol_resource_handle}] = undefined;",
                                );
                            } else {
                                // When expecting a borrow, the JS resource provided will always be an own
                                // handle. This is because it is not possible for borrow handles to be passed
                                // back reentrantly.
                                // We then set the handle to the rep per the local borrow rule.
                                let rsc_flag = self.intrinsic(Intrinsic::ResourceTableFlag);
                                let own_handle = format!("handle{}", self.tmp());
                                uwriteln!(self.src,
                                    "var {own_handle} = {op}[{symbol_resource_handle}];
                                    if (!{own_handle} || (handleTable{tid}[({own_handle} << 1) + 1] & {rsc_flag}) === 0) {{
                                        throw new TypeError('Resource error: Not a valid \"{class_name}\" resource.');
                                    }}
                                    var {handle} = handleTable{tid}[({own_handle} << 1) + 1] & ~{rsc_flag};",
                                );
                            }
                        } else {
                            // Imported resources may already have a handle if they were constructed
                            // by a component and then passed out.
                            uwriteln!(
                                self.src,
                                "if (!({op} instanceof {local_name})) {{
                                     throw new TypeError('Resource error: Not a valid \"{class_name}\" resource.');
                                 }}
                                 var {handle} = {op}[{symbol_resource_handle}];",
                            );
                            // Otherwise, in hybrid bindgen we check for a Symbol.for('cabiRep')
                            // to get the resource rep.
                            // Fall back to assign a new rep in the capture table, when the imported
                            // resource was constructed externally.
                            let symbol_resource_rep = self.intrinsic(Intrinsic::SymbolResourceRep);
                            let rsc_table_create = if is_own {
                                self.intrinsic(Intrinsic::ResourceTableCreateOwn)
                            } else {
                                self.intrinsic(Intrinsic::ScopeId);
                                self.intrinsic(Intrinsic::ResourceTableCreateBorrow)
                            };
                            uwriteln!(
                                self.src,
                                "if (!{handle}) {{
                                    const rep = {op}[{symbol_resource_rep}] || ++captureCnt{rid};
                                    captureTable{rid}.set(rep, {op});
                                    {handle} = {rsc_table_create}(handleTable{tid}, rep);
                                }}"
                            );
                        }
                    }

                    ResourceData::Guest {
                        resource_name,
                        prefix,
                    } => {
                        let upper_camel = resource_name.to_upper_camel_case();
                        let lower_camel = resource_name.to_lower_camel_case();
                        let prefix = prefix.as_deref().unwrap_or("");

                        if !imported {
                            let local_rep = format!("localRep{}", self.tmp());
                            uwriteln!(
                                self.src,
                                "if (!({op} instanceof {upper_camel})) {{
                                    throw new TypeError('Resource error: Not a valid \"{upper_camel}\" resource.');
                                }}
                                let {handle} = {op}[{symbol_resource_handle}];",
                            );

                            if is_own {
                                uwriteln!(
                                    self.src,
                                    "if ({handle} === undefined) {{
                                        var {local_rep} = repCnt++;
                                        repTable.set({local_rep}, {{ rep: {op}, own: true }});
                                        {handle} = $resource_{prefix}new${lower_camel}({local_rep});
                                        {op}[{symbol_resource_handle}] = {handle};
                                        finalizationRegistry_export${prefix}{lower_camel}.register({op}, {handle}, {op});
                                    }}
                                    "
                                );
                            } else {
                                uwriteln!(
                                    self.src,
                                    "if ({handle} === undefined) {{
                                        var {local_rep} = repCnt++;
                                        repTable.set({local_rep}, {{ rep: {op}, own: false }});
                                        {op}[{symbol_resource_handle}] = {local_rep};
                                    }}
                                    "
                                );
                            }
                        } else {
                            let symbol_resource_handle =
                                self.intrinsic(Intrinsic::SymbolResourceHandle);
                            uwrite!(
                                self.src,
                                "var {handle} = {op}[{symbol_resource_handle}];
                                 finalizationRegistry_import${prefix}{lower_camel}.unregister({op});
                                "
                            );
                        }
                    }
                }
                results.push(handle);
            }
            Instruction::GuestDeallocate { .. }
            | Instruction::GuestDeallocateString
            | Instruction::GuestDeallocateList { .. }
            | Instruction::GuestDeallocateVariant { .. } => unimplemented!("Guest deallocation"),
        }
    }
}

/// Tests whether `ty` can be represented with `null`, and if it can then
/// the "other type" is returned. If `Some` is returned that means that `ty`
/// is `null | <return>`. If `None` is returned that means that `null` can't
/// be used to represent `ty`.
pub fn as_nullable<'a>(resolve: &'a Resolve, ty: &'a Type) -> Option<&'a Type> {
    let id = match ty {
        Type::Id(id) => *id,
        _ => return None,
    };
    match &resolve.types[id].kind {
        // If `ty` points to an `option<T>`, then `ty` can be represented
        // with `null` if `t` itself can't be represented with null. For
        // example `option<option<u32>>` can't be represented with `null`
        // since that's ambiguous if it's `none` or `some(none)`.
        //
        // Note, oddly enough, that `option<option<option<u32>>>` can be
        // represented as `null` since:
        //
        // * `null` => `none`
        // * `{ tag: "none" }` => `some(none)`
        // * `{ tag: "some", val: null }` => `some(some(none))`
        // * `{ tag: "some", val: 1 }` => `some(some(some(1)))`
        //
        // It's doubtful anyone would actually rely on that though due to
        // how confusing it is.
        TypeDefKind::Option(t) => {
            if !maybe_null(resolve, t) {
                Some(t)
            } else {
                None
            }
        }
        TypeDefKind::Type(t) => as_nullable(resolve, t),
        _ => None,
    }
}

pub fn maybe_null(resolve: &Resolve, ty: &Type) -> bool {
    as_nullable(resolve, ty).is_some()
}

pub fn array_ty(resolve: &Resolve, ty: &Type) -> Option<&'static str> {
    match ty {
        Type::Bool => None,
        Type::U8 => Some("Uint8Array"),
        Type::S8 => Some("Int8Array"),
        Type::U16 => Some("Uint16Array"),
        Type::S16 => Some("Int16Array"),
        Type::U32 => Some("Uint32Array"),
        Type::S32 => Some("Int32Array"),
        Type::U64 => Some("BigUint64Array"),
        Type::S64 => Some("BigInt64Array"),
        Type::F32 => Some("Float32Array"),
        Type::F64 => Some("Float64Array"),
        Type::Char => None,
        Type::String => None,
        Type::Id(id) => match &resolve.types[*id].kind {
            TypeDefKind::Type(t) => array_ty(resolve, t),
            _ => None,
        },
    }
}
