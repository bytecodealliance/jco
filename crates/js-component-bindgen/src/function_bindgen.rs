use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write;
use std::mem;

use heck::{ToLowerCamelCase, ToUpperCamelCase};
use wasmtime_environ::component::{
    CanonicalOptions, ResourceIndex, TypeComponentLocalErrorContextTableIndex,
    TypeFutureTableIndex, TypeResourceTableIndex, TypeStreamTableIndex,
};
use wit_bindgen_core::abi::{Bindgen, Bitcast, Instruction};
use wit_component::StringEncoding;
use wit_parser::abi::WasmType;
use wit_parser::{
    Alignment, ArchitectureSize, Handle, Resolve, SizeAlign, Type, TypeDefKind, TypeId,
};

use crate::intrinsics::Intrinsic;
use crate::intrinsics::component::ComponentIntrinsic;
use crate::intrinsics::conversion::ConversionIntrinsic;
use crate::intrinsics::js_helper::JsHelperIntrinsic;
use crate::intrinsics::p3::async_future::AsyncFutureIntrinsic;
use crate::intrinsics::p3::async_stream::AsyncStreamIntrinsic;
use crate::intrinsics::p3::async_task::AsyncTaskIntrinsic;
use crate::intrinsics::resource::ResourceIntrinsic;
use crate::intrinsics::string::StringIntrinsic;
use crate::{ManagesIntrinsics, get_thrown_type, source};
use crate::{uwrite, uwriteln};

/// Method of error handling
#[derive(Debug, Clone, PartialEq)]
pub enum ErrHandling {
    /// Do no special handling of errors, requiring users to return objects that represent
    /// errors as represented in WIT
    None,
    /// Require throwing of result error objects
    ThrowResultErr,
    /// Catch thrown errors and convert them into result<t,e> error variants
    ResultCatchHandler,
}

impl ErrHandling {
    fn to_js_string(&self) -> String {
        match self {
            ErrHandling::None => "none".into(),
            ErrHandling::ThrowResultErr => "throw-result-err".into(),
            ErrHandling::ResultCatchHandler => "result-catch-handler".into(),
        }
    }
}

/// Data related to a given resource
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
        extra: Option<ResourceExtraData>,
    },
}

/// Supplemental data kept along with [`ResourceData`]
#[derive(Clone, Debug, PartialEq)]
pub enum ResourceExtraData {
    Stream {
        table_idx: TypeStreamTableIndex,
        elem_ty: Option<Type>,
    },
    Future {
        table_idx: TypeFutureTableIndex,
        elem_ty: Option<Type>,
    },
    ErrorContext {
        table_idx: TypeComponentLocalErrorContextTableIndex,
    },
}

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
/// - captureTable{y} (rep to instance map for captured imported tables, only for JS import bindgen, not hybrid)
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
#[derive(Clone, Debug, PartialEq)]
pub struct ResourceTable {
    /// Whether a resource was imported
    ///
    /// This should be tracked because imported types cannot be re-exported uniquely (?)
    pub imported: bool,

    /// Data related to the actual resource
    pub data: ResourceData,
}

/// A mapping of type IDs to the resources that they represent
pub type ResourceMap = BTreeMap<TypeId, ResourceTable>;

pub struct FunctionBindgen<'a> {
    /// Mapping of resources for types that have corresponding definitions locally
    pub resource_map: &'a ResourceMap,

    /// Whether current resource borrows need to be deactivated
    pub clear_resource_borrows: bool,

    /// Set of intrinsics
    pub intrinsics: &'a mut BTreeSet<Intrinsic>,

    /// Whether to perform valid lifting optimization
    pub valid_lifting_optimization: bool,

    /// Sizes and alignments for sub elements
    pub sizes: &'a SizeAlign,

    /// Method of error handling
    pub err: ErrHandling,

    /// Temporary values
    pub tmp: usize,

    /// Source code of the function
    pub src: source::Source,

    /// Block storage
    pub block_storage: Vec<source::Source>,

    /// Blocks of the function
    pub blocks: Vec<(String, Vec<String>)>,

    /// Parameters of the function
    pub params: Vec<String>,

    /// Memory variable
    pub memory: Option<&'a String>,

    /// Realloc function name
    pub realloc: Option<&'a String>,

    /// Post return function name
    pub post_return: Option<&'a String>,

    /// Prefix to use when printing tracing information
    pub tracing_prefix: &'a String,

    /// Whether tracing is enabled
    pub tracing_enabled: bool,

    /// Method if string encoding
    pub encoding: StringEncoding,

    /// Callee of the function
    pub callee: &'a str,

    /// Whether the callee is dynamic (i.e. has multiple operands)
    pub callee_resource_dynamic: bool,

    /// The [`wit_bindgen::Resolve`] containing extracted WIT information
    pub resolve: &'a Resolve,

    /// Whether the function requires async porcelain
    ///
    /// In the case of an import this likely implies the use of JSPI
    /// and in the case of an export this is simply code generation metadata.
    pub requires_async_porcelain: bool,

    /// Whether the function is guest async lifted (i.e. WASI P3)
    pub is_async: bool,

    /// Canon opts
    pub canon_opts: &'a CanonicalOptions,

    /// Interface name
    pub iface_name: Option<&'a str>,
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

    fn load(
        &mut self,
        method: &str,
        offset: ArchitectureSize,
        operands: &[String],
        results: &mut Vec<String>,
    ) {
        let view = self.intrinsic(Intrinsic::JsHelper(JsHelperIntrinsic::DataView));
        let Some(memory) = self.memory.as_ref() else {
            panic!(
                "unexpectedly missing memory during bindgen for interface [{:?}] (callee {})",
                self.iface_name, self.callee,
            );
        };
        results.push(format!(
            "{view}({memory}).{method}({} + {offset}, true)",
            operands[0],
            offset = offset.size_wasm32()
        ));
    }

    fn store(&mut self, method: &str, offset: ArchitectureSize, operands: &[String]) {
        let view = self.intrinsic(Intrinsic::JsHelper(JsHelperIntrinsic::DataView));
        let memory = self.memory.as_ref().unwrap();
        uwriteln!(
            self.src,
            "{view}({memory}).{method}({} + {offset}, {}, true);",
            operands[1],
            operands[0],
            offset = offset.size_wasm32()
        );
    }

    /// Write result assignment lines to output
    ///
    /// In general this either means writing preambles, for example that look like the following:
    ///
    /// ```js
    /// let ret =
    /// ```
    ///
    /// ```
    /// var [ ret0, ret1, ret2 ] =
    /// ```
    ///
    /// # Arguments
    ///
    /// * `amt` - number of results
    /// * `results` - list of variables that will be returned
    ///
    fn write_result_assignment(&mut self, amt: usize, results: &mut Vec<String>) {
        match amt {
            0 => uwrite!(self.src, "let ret;"),
            1 => {
                uwrite!(self.src, "let ret = ");
                results.push("ret".to_string());
            }
            n => {
                uwrite!(self.src, "var [");
                for i in 0..n {
                    if i > 0 {
                        uwrite!(self.src, ", ");
                    }
                    uwrite!(self.src, "ret{}", i);
                    results.push(format!("ret{i}"));
                }
                uwrite!(self.src, "] = ");
            }
        }
    }

    fn bitcast(&mut self, cast: &Bitcast, op: &str) -> String {
        match cast {
            Bitcast::I32ToF32 => {
                let cvt = self.intrinsic(Intrinsic::Conversion(ConversionIntrinsic::I32ToF32));
                format!("{cvt}({op})")
            }
            Bitcast::F32ToI32 => {
                let cvt = self.intrinsic(Intrinsic::Conversion(ConversionIntrinsic::F32ToI32));
                format!("{cvt}({op})")
            }
            Bitcast::I64ToF64 => {
                let cvt = self.intrinsic(Intrinsic::Conversion(ConversionIntrinsic::I64ToF64));
                format!("{cvt}({op})")
            }
            Bitcast::F64ToI64 => {
                let cvt = self.intrinsic(Intrinsic::Conversion(ConversionIntrinsic::F64ToI64));
                format!("{cvt}({op})")
            }
            Bitcast::I32ToI64 => format!("BigInt({op})"),
            Bitcast::I64ToI32 => format!("Number({op})"),
            Bitcast::I64ToF32 => {
                let cvt = self.intrinsic(Intrinsic::Conversion(ConversionIntrinsic::I32ToF32));
                format!("{cvt}(Number({op}))")
            }
            Bitcast::F32ToI64 => {
                let cvt = self.intrinsic(Intrinsic::Conversion(ConversionIntrinsic::F32ToI32));
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

    /// Start the current task
    ///
    /// The code generated by this function *may* also start a subtask
    /// where appropriate.
    fn start_current_task(&mut self, instr: &Instruction) {
        let is_async = self.is_async;
        let fn_name = self.callee;
        let err_handling = self.err.to_js_string();
        let callback_fn_js = self
            .canon_opts
            .callback
            .as_ref()
            .map(|v| format!("callback_{}", v.as_u32()))
            .unwrap_or_else(|| "null".into());
        let (calling_wasm_export, prefix) = match instr {
            Instruction::CallWasm { .. } => (true, "_wasm_call_"),
            Instruction::CallInterface { .. } => (false, "_interface_call_"),
            _ => unreachable!(
                "unrecognized instruction triggering start of current task: [{instr:?}]"
            ),
        };
        let start_current_task_fn = self.intrinsic(Intrinsic::AsyncTask(
            AsyncTaskIntrinsic::CreateNewCurrentTask,
        ));
        let component_instance_idx = self.canon_opts.instance.as_u32();

        uwriteln!(
            self.src,
            r#"
              const [task, {prefix}currentTaskID] = {start_current_task_fn}({{
                  componentIdx: {component_instance_idx},
                  isAsync: {is_async},
                  entryFnName: '{fn_name}',
                  getCallbackFn: () => {callback_fn_js},
                  callbackFnName: '{callback_fn_js}',
                  errHandling: '{err_handling}',
                  callingWasmExport: {calling_wasm_export},
              }});
            "#,
        );
    }

    /// End an an existing current task
    ///
    /// Optionally, ending the current task can also return the value
    /// collected by the task, primarily relevant when dealing with
    /// async lowered imports (in particular AsyncTaskReturn) that must return
    /// collected values from the current task in question.
    fn end_current_task(&mut self) {
        let end_current_task_fn =
            self.intrinsic(Intrinsic::AsyncTask(AsyncTaskIntrinsic::EndCurrentTask));
        let component_instance_idx = self.canon_opts.instance.as_u32();
        uwriteln!(self.src, "{end_current_task_fn}({component_instance_idx});",);
    }
}

impl ManagesIntrinsics for FunctionBindgen<'_> {
    /// Add an intrinsic, supplying it's name afterwards
    fn add_intrinsic(&mut self, intrinsic: Intrinsic) {
        self.intrinsic(intrinsic);
    }
}

impl Bindgen for FunctionBindgen<'_> {
    type Operand = String;

    /// Get the sizes and alignment for a given structure
    fn sizes(&self) -> &SizeAlign {
        self.sizes
    }

    /// Push a new block of code
    fn push_block(&mut self) {
        let prev = mem::take(&mut self.src);
        self.block_storage.push(prev);
    }

    /// Finish a block of code
    fn finish_block(&mut self, operands: &mut Vec<String>) {
        let to_restore = self.block_storage.pop().unwrap();
        let src = mem::replace(&mut self.src, to_restore);
        self.blocks.push((src.into(), mem::take(operands)));
    }

    /// Output the return pointer
    fn return_pointer(&mut self, _size: ArchitectureSize, _align: Alignment) -> String {
        unimplemented!("determining the return pointer for this function is not implemented");
    }

    /// Check whether a list of the given element type can be represented as a builtni JS type
    ///
    /// # Arguments
    ///
    /// * `resolve` - the [`Resolve`] that might be used to resolve nested types (i.e. [`Type::TypeId`])
    /// * `elem_ty` - the [`Type`] of the element stored in the list
    ///
    fn is_list_canonical(&self, resolve: &Resolve, elem_ty: &Type) -> bool {
        js_array_ty(resolve, elem_ty).is_some()
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

            Instruction::U8FromI32 => self.clamp_guest(results, operands, u8::MIN, u8::MAX),

            Instruction::S8FromI32 => self.clamp_guest(results, operands, i8::MIN, i8::MAX),

            Instruction::U16FromI32 => self.clamp_guest(results, operands, u16::MIN, u16::MAX),

            Instruction::S16FromI32 => self.clamp_guest(results, operands, i16::MIN, i16::MAX),

            Instruction::U32FromI32 => results.push(format!("{} >>> 0", operands[0])),

            Instruction::U64FromI64 => results.push(format!("BigInt.asUintN(64, {})", operands[0])),

            Instruction::S32FromI32 | Instruction::S64FromI64 => {
                results.push(operands.pop().unwrap())
            }

            Instruction::I32FromU8 => {
                let conv = self.intrinsic(Intrinsic::Conversion(ConversionIntrinsic::ToUint8));
                results.push(format!("{conv}({op})", op = operands[0]))
            }

            Instruction::I32FromS8 => {
                let conv = self.intrinsic(Intrinsic::Conversion(ConversionIntrinsic::ToInt8));
                results.push(format!("{conv}({op})", op = operands[0]))
            }

            Instruction::I32FromU16 => {
                let conv = self.intrinsic(Intrinsic::Conversion(ConversionIntrinsic::ToUint16));
                results.push(format!("{conv}({op})", op = operands[0]))
            }

            Instruction::I32FromS16 => {
                let conv = self.intrinsic(Intrinsic::Conversion(ConversionIntrinsic::ToInt16));
                results.push(format!("{conv}({op})", op = operands[0]))
            }

            Instruction::I32FromU32 => {
                let conv = self.intrinsic(Intrinsic::Conversion(ConversionIntrinsic::ToUint32));
                results.push(format!("{conv}({op})", op = operands[0]))
            }

            Instruction::I32FromS32 => {
                let conv = self.intrinsic(Intrinsic::Conversion(ConversionIntrinsic::ToInt32));
                results.push(format!("{conv}({op})", op = operands[0]))
            }

            Instruction::I64FromU64 => {
                let conv = self.intrinsic(Intrinsic::Conversion(ConversionIntrinsic::ToBigUint64));
                results.push(format!("{conv}({op})", op = operands[0]))
            }

            Instruction::I64FromS64 => {
                let conv = self.intrinsic(Intrinsic::Conversion(ConversionIntrinsic::ToBigInt64));
                results.push(format!("{conv}({op})", op = operands[0]))
            }

            Instruction::F32FromCoreF32 | Instruction::F64FromCoreF64 => {
                results.push(operands.pop().unwrap())
            }

            Instruction::CoreF32FromF32 | Instruction::CoreF64FromF64 => {
                results.push(format!("+{}", operands[0]))
            }

            Instruction::CharFromI32 => {
                let validate =
                    self.intrinsic(Intrinsic::String(StringIntrinsic::ValidateGuestChar));
                results.push(format!("{}({})", validate, operands[0]));
            }

            Instruction::I32FromChar => {
                let validate = self.intrinsic(Intrinsic::String(StringIntrinsic::ValidateHostChar));
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
                    let name = format!("v{tmp}_{i}");
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
                    let name = format!("tuple{tmp}_{i}");
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
                    results.push(format!("variant{tmp}_{i}"));
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
                results.push(format!("variant{tmp}"));
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

            // The ListCanonLower instruction is called on async function parameter lowers
            //
            // We ignore `realloc` in the instruction because it's the name of the *import* from the
            // component's side (i.e. `"cabi_realloc"`). Bindings have already set up the appropriate
            // realloc for the current component (e.g. `realloc0`) and it is available in the bindgen
            // object @ `self.realloc`
            //
            Instruction::ListCanonLower { element, .. } => {
                let tmp = self.tmp();
                let memory = self.memory.as_ref().unwrap();
                let realloc = self.realloc.unwrap();

                // Gather metadata about list element
                let size = self.sizes.size(element).size_wasm32();
                let align = ArchitectureSize::from(self.sizes.align(element)).size_wasm32();

                // Alias the list to a local variable
                uwriteln!(self.src, "var val{tmp} = {};", operands[0]);
                if matches!(element, Type::U8) {
                    uwriteln!(self.src, "var len{tmp} = val{tmp}.byteLength;");
                } else {
                    uwriteln!(self.src, "var len{tmp} = val{tmp}.length;");
                }

                // Allocate space for the type in question
                uwriteln!(
                    self.src,
                    "var ptr{tmp} = {realloc}(0, 0, {align}, len{tmp} * {size});",
                );

                // We may or may not be dealing with a buffer like object or a regular JS array,
                // in which case we can detect and use the right value

                // Determine what methods to use with a DataView when setting the data
                let dataview_set_method = match element {
                    Type::Bool | Type::U8 => "setUint8",
                    Type::U16 => "setUint16",
                    Type::U32 => "setUint32",
                    Type::U64 => "setUint64",
                    Type::S8 => "setInt8",
                    Type::S16 => "setInt16",
                    Type::S32 => "setInt32",
                    Type::S64 => "setInt64",
                    Type::F32 => "setFloat32",
                    Type::F64 => "setFloat64",
                    _ => unreachable!("unsupported type [{element:?}] for canonical list lower"),
                };

                // Detect whether we're dealing with a regular array
                uwriteln!(
                    self.src,
                    r#"
                        let valData{tmp};
                        const valLenBytes{tmp} = len{tmp} * {size};
                        if (Array.isArray(val{tmp})) {{
                            // Regular array likely containing numbers, write values to memory
                            let offset = 0;
                            const dv{tmp} = new DataView({memory}.buffer);
                            for (const v of val{tmp}) {{
                                dv{tmp}.{dataview_set_method}(ptr{tmp} + offset, v, true);
                                offset += {size};
                            }}
                        }} else {{
                            // TypedArray / ArrayBuffer-like, direct copy
                            valData{tmp} = new Uint8Array(val{tmp}.buffer || val{tmp}, val{tmp}.byteOffset, valLenBytes{tmp});
                            const out{tmp} = new Uint8Array({memory}.buffer, ptr{tmp},valLenBytes{tmp});
                            out{tmp}.set(valData{tmp});
                        }}
                    "#,
                );

                results.push(format!("ptr{tmp}"));
                results.push(format!("len{tmp}"));
            }

            Instruction::ListCanonLift { element, .. } => {
                let tmp = self.tmp();
                let memory = self.memory.as_ref().unwrap();
                uwriteln!(self.src, "var ptr{tmp} = {};", operands[0]);
                uwriteln!(self.src, "var len{tmp} = {};", operands[1]);
                uwriteln!(
                    self.src,
                    "var result{tmp} = new {array_ty}({memory}.buffer.slice(ptr{tmp}, ptr{tmp} + len{tmp} * {elem_size}));",
                    elem_size = self.sizes.size(element).size_wasm32(),
                    array_ty = js_array_ty(resolve, element).unwrap(), // TODO: this is the wrong endianness
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
                    Intrinsic::String(StringIntrinsic::Utf16Encode)
                } else {
                    Intrinsic::String(StringIntrinsic::Utf8Encode)
                };
                let encode = self.intrinsic(intrinsic);
                let tmp = self.tmp();
                let memory = self.memory.as_ref().unwrap();
                let str = String::from("cabi_realloc");
                let realloc = self.realloc.unwrap_or(&str);
                let s = &operands[0];
                uwriteln!(
                    self.src,
                    r#"
                      var encodeRes = {encode}({s}, {realloc}, {memory});
                      var ptr{tmp} = encodeRes.ptr;
                      var len{tmp} = {encoded_len};
                    "#,
                    encoded_len = match self.encoding {
                        StringEncoding::UTF8 => "encodeRes.len".into(),
                        _ => format!("{}.length", s),
                    }
                );
                results.push(format!("ptr{tmp}"));
                results.push(format!("len{tmp}"));
            }

            Instruction::StringLift => {
                // Only Utf8 and Utf16 supported for now
                assert!(matches!(
                    self.encoding,
                    StringEncoding::UTF8 | StringEncoding::UTF16
                ));
                let decoder = self.intrinsic(match self.encoding {
                    StringEncoding::UTF16 => Intrinsic::String(StringIntrinsic::Utf16Decoder),
                    _ => Intrinsic::String(StringIntrinsic::GlobalTextDecoderUtf8),
                });
                let tmp = self.tmp();
                let memory = self.memory.as_ref().unwrap();
                uwriteln!(self.src, "var ptr{tmp} = {};", operands[0]);
                uwriteln!(self.src, "var len{tmp} = {};", operands[1]);
                uwriteln!(
                    self.src,
                    "var result{tmp} = {decoder}.decode(new Uint{}Array({memory}.buffer, ptr{tmp}, len{tmp}));",
                    if self.encoding == StringEncoding::UTF16 {
                        "16"
                    } else {
                        "8"
                    }
                );
                results.push(format!("result{tmp}"));
            }

            Instruction::ListLower { element, .. } => {
                let (body, body_results) = self.blocks.pop().unwrap();
                assert!(body_results.is_empty());
                let tmp = self.tmp();
                let vec = format!("vec{tmp}");
                let result = format!("result{tmp}");
                let len = format!("len{tmp}");
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

            Instruction::CallWasm { name, sig } => {
                let debug_log_fn = self.intrinsic(Intrinsic::DebugLog);
                // let global_async_param_lower_class =
                //     self.intrinsic(Intrinsic::GlobalAsyncParamLowersClass);
                let has_post_return = self.post_return.is_some();
                let is_async = self.is_async;
                uwriteln!(
                    self.src,
                    "{debug_log_fn}('{prefix} [Instruction::CallWasm] enter', {{
                         funcName: '{name}',
                         paramCount: {param_count},
                         async: {is_async},
                         postReturn: {has_post_return},
                      }});",
                    param_count = sig.params.len(),
                    prefix = self.tracing_prefix,
                );

                // Write out whether the caller was host provided
                // (if we're calling into wasm then we know it was not)
                uwriteln!(self.src, "const hostProvided = false;");

                // Inject machinery for starting a 'current' task
                // (this will define the 'task' variable)
                self.start_current_task(inst);

                // TODO: trap if this component is already on the call stack (re-entrancy)

                // TODO(threads): start a thread
                // TODO(threads): Task#enter needs to be called with the thread that is executing (inside thread_func)
                // TODO(threads): thread_func will contain the actual call rather than attempting to execute immediately

                // If we're dealing with an async task, do explicit task enter
                if self.requires_async_porcelain {
                    uwriteln!(
                        self.src,
                        r#"
                        const started = await task.enter();
                        if (!started) {{
                            {debug_log_fn}('[Instruction::AsyncTaskReturn] failed to enter task', {{
                                taskID: preparedTask.id(),
                                subtaskID: currentSubtask?.id(),
                            }});
                            throw new Error("failed to enter task");
                        }}
                        "#,
                    );
                }

                // If we're async w/ params that have been lowered, we must lower the params
                //
                // TODO(fix): this isn't how to tell whether we need to do async lower...
                // this seems to only be the case when doing a ListCanonLower
                // if self.is_async
                //     && let Some(memory) = self.memory
                // {
                //     let component_idx = self.canon_opts.instance.as_u32();
                //     uwriteln!(
                //         self.src,
                //         r#"
                //         {{
                //             const paramLowerFn = {global_async_param_lower_class}.lookup({{
                //                 componentIdx: {component_idx},
                //                 iface: '{iface_name}',
                //                 fnName: '{callee}',
                //             }});
                //             if (!paramLowerFn) {{
                //                 throw new Error(`missing async param lower function for generated export fn [{callee}]`);
                //             }}
                //             paramLowerFn({{
                //                 memory: {memory},
                //                 vals: [{params}],
                //                 indirect: {indirect},
                //                 loweringParams: [{operands}],
                //             }});
                //         }}
                //         "#,
                //         operands = operands.join(","),
                //         params = self.params.join(","),
                //         indirect = sig.indirect_params,
                //         callee = self.callee,
                //         iface_name = self.iface_name.unwrap_or("$root"),
                //     );
                // }

                // Output result binding preamble (e.g. 'var ret =', 'var [ ret0, ret1] = exports...() ')
                let sig_results_length = sig.results.len();
                self.write_result_assignment(sig_results_length, results);

                // Write the rest of the result asignment -- calling the callee function
                uwriteln!(
                    self.src,
                    "{maybe_async_await}{callee}({args});",
                    callee = self.callee,
                    args = operands.join(", "),
                    maybe_async_await = if self.requires_async_porcelain {
                        "await "
                    } else {
                        ""
                    }
                );

                if self.tracing_enabled {
                    let prefix = self.tracing_prefix;
                    let to_result_string =
                        self.intrinsic(Intrinsic::Conversion(ConversionIntrinsic::ToResultString));
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

                if !self.is_async {
                    // If we're not dealing with an async call, we can immediately end the task
                    // after the call has completed.
                    self.end_current_task();
                }
            }

            // Call to an interface, usually but not always an externally imported interface
            Instruction::CallInterface { func, async_ } => {
                let debug_log_fn = self.intrinsic(Intrinsic::DebugLog);
                let start_current_task_fn = self.intrinsic(Intrinsic::AsyncTask(
                    AsyncTaskIntrinsic::CreateNewCurrentTask,
                ));
                let current_task_get_fn =
                    self.intrinsic(Intrinsic::AsyncTask(AsyncTaskIntrinsic::GetCurrentTask));
                let component_instance_idx = self.canon_opts.instance.as_u32();

                uwriteln!(
                    self.src,
                    "{debug_log_fn}('{prefix} [Instruction::CallInterface] ({async_}, @ enter)');",
                    prefix = self.tracing_prefix,
                    async_ = async_.then_some("async").unwrap_or("sync"),
                );

                // Determine the callee function and arguments
                let (fn_js, args_js) = if self.callee_resource_dynamic {
                    (
                        format!("{}.{}", operands[0], self.callee),
                        operands[1..].join(", "),
                    )
                } else {
                    (self.callee.into(), operands.join(", "))
                };

                uwriteln!(self.src, "let hostProvided = false;");
                match func.kind {
                    wit_parser::FunctionKind::Constructor(_) => {
                        let cls = fn_js.trim_start_matches("new ");
                        uwriteln!(self.src, "hostProvided = {cls}?._isHostProvided;");
                    }
                    wit_parser::FunctionKind::Freestanding
                    | wit_parser::FunctionKind::AsyncFreestanding
                    | wit_parser::FunctionKind::Method(_)
                    | wit_parser::FunctionKind::AsyncMethod(_)
                    | wit_parser::FunctionKind::Static(_)
                    | wit_parser::FunctionKind::AsyncStatic(_) => {
                        uwriteln!(self.src, "hostProvided = {fn_js}?._isHostProvided;");
                    }
                }

                // Start the necessary subtasks and/or host task
                //
                // We must create a subtask in the case of an async host import.
                //
                // If there's no parent task, we're not executing in a subtask situation,
                // so we can just create the new task and immediately continue execution.
                //
                // If there *is* a parent task, then we are likely about to create new task that
                // matches/belongs to an existing subtask in the parent task.
                //
                // If we're dealing with a function that has been marked as a host import, then
                // we expect that `Trampoline::LowerImport` and relevant intrinsics were called before
                // this, and a subtask has been set up.
                //
                uwriteln!(
                    self.src,
                    r#"
                    let parentTask;
                    let task;
                    let subtask;

                    const createTask = () => {{
                        const results = {start_current_task_fn}({{
                            componentIdx: {component_instance_idx},
                            isAsync: {is_async},
                            entryFnName: '{fn_name}',
                            getCallbackFn: () => {callback_fn_js},
                            callbackFnName: '{callback_fn_js}',
                            errHandling: '{err_handling}',
                            callingWasmExport: false,
                        }});
                        task = results[0];
                    }};

                    taskCreation: {{
                        parentTask = {current_task_get_fn}({component_instance_idx})?.task;
                        if (!parentTask) {{
                            createTask();
                            break taskCreation;
                        }}

                        createTask();

                        const isHostAsyncImport = hostProvided && {is_async};
                        if (isHostAsyncImport) {{
                            subtask = parentTask.getLatestSubtask();
                            if (!subtask) {{
                                throw new Error("Missing subtask for host import, has the import been lowered? (ensure asyncImports are set properly)");
                            }}
                            subtask.setChildTask(task);
                            task.setParentSubtask(subtask);
                        }}
                    }}
                    "#,
                    is_async = self.is_async,
                    fn_name = self.callee,
                    err_handling = self.err.to_js_string(),
                    callback_fn_js = self
                        .canon_opts
                        .callback
                        .as_ref()
                        .map(|v| format!("callback_{}", v.as_u32()))
                        .unwrap_or_else(|| "null".into()),
                );

                let results_length = if func.result.is_none() { 0 } else { 1 };
                let is_async = self.requires_async_porcelain || *async_;

                // If the task is async, do an explicit wait for backpressure before the call execution
                if is_async {
                    uwriteln!(
                        self.src,
                        r#"
                        const started = await task.enter();
                        if (!started) {{
                            {debug_log_fn}('[Instruction::CallInterface] failed to enter task', {{
                                taskID: preparedTask.id(),
                                subtaskID: currentSubtask?.id(),
                            }});
                            throw new Error("failed to enter task");
                        }}
                        "#,
                    );
                }

                // Build the JS expression that calls the callee
                let call = format!(
                    "{maybe_await} {fn_js}({args_js})",
                    maybe_await = if is_async { "await " } else { "" }
                );

                match self.err {
                    // If configured to do *no* error handling at all or throw
                    // error objects directly, we can simply perform the call
                    ErrHandling::None | ErrHandling::ThrowResultErr => {
                        self.write_result_assignment(results_length, results);
                        uwriteln!(self.src, "{call};");
                    }
                    // If configured to force all thrown errors into result objects,
                    // then we add a try/catch around the call
                    ErrHandling::ResultCatchHandler => {
                        // result<_, string> allows JS error coercion only, while
                        // any other result type will trap for arbitrary JS errors.
                        let err_payload = if let (_, Some(Type::Id(err_ty))) =
                            get_thrown_type(self.resolve, func.result).unwrap()
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
                            r#"
                            let ret;
                            try {{
                                ret = {{ tag: 'ok', val: {call} }};
                            }} catch (e) {{
                                ret = {{ tag: 'err', val: {err_payload}(e) }};
                            }}
                            "#,
                        );
                        results.push("ret".to_string());
                    }
                }

                if self.tracing_enabled {
                    let prefix = self.tracing_prefix;
                    let to_result_string =
                        self.intrinsic(Intrinsic::Conversion(ConversionIntrinsic::ToResultString));
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

                // TODO: if it was an async call, we may not be able to clear the borrows yet.
                // save them to the task/ensure they are added to the task's list of borrows?
                //
                // TODO: if there is a subtask, we must not clear borrows until subtask.deliverReturn
                // is called.

                // After a high level call, we need to deactivate the component resource borrows.
                if self.clear_resource_borrows {
                    let symbol_resource_handle = self.intrinsic(Intrinsic::SymbolResourceHandle);
                    let cur_resource_borrows =
                        self.intrinsic(Intrinsic::Resource(ResourceIntrinsic::CurResourceBorrows));
                    let is_host = matches!(
                        self.resource_map.iter().nth(0).unwrap().1.data,
                        ResourceData::Host { .. }
                    );

                    if is_host {
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
                    self.clear_resource_borrows = false;
                }

                // For non-async calls, the current task can end immediately
                if !async_ {
                    self.end_current_task();
                }
            }

            Instruction::Return {
                func,
                amt: stack_value_count,
            } => {
                let debug_log_fn = self.intrinsic(Intrinsic::DebugLog);
                uwriteln!(
                    self.src,
                    "{debug_log_fn}('{prefix} [Instruction::Return]', {{
                         funcName: '{func_name}',
                         paramCount: {stack_value_count},
                         async: {is_async},
                         postReturn: {post_return_present}
                      }});",
                    func_name = func.name,
                    post_return_present = self.post_return.is_some(),
                    is_async = self.is_async,
                    prefix = self.tracing_prefix,
                );

                // Build the post return functionality
                // to clean up tasks and possibly return values
                let get_or_create_async_state_fn = self.intrinsic(Intrinsic::Component(
                    ComponentIntrinsic::GetOrCreateAsyncState,
                ));
                let gen_post_return_js = |(invocation_stmt, ret_stmt): (String, Option<String>)| {
                    format!(
                        "
                        let cstate = {get_or_create_async_state_fn}({component_idx});
                        cstate.mayLeave = false;
                        {invocation_stmt}
                        cstate.mayLeave = true;
                        {ret_stmt}
                  ",
                        component_idx = self.canon_opts.instance.as_u32(),
                        ret_stmt = ret_stmt.unwrap_or_default(),
                    )
                };

                assert!(!self.is_async, "async functions should use AsyncTaskReturn");

                // Depending how many values are on the stack after returning, we must execute differently.
                //
                // In particular, if this function is async (distinct from whether async porcelain was necessary or not),
                // rather than simply executing the function we must return (or block for) the promise that was created
                // for the task.
                match stack_value_count {
                    // (sync) Handle no result case
                    0 => {
                        if let Some(f) = &self.post_return {
                            uwriteln!(
                                self.src,
                                "{}",
                                gen_post_return_js((format!("{f}();"), None))
                            );
                        }
                    }

                    // (sync) Handle single `result<t>` case
                    1 if self.err == ErrHandling::ThrowResultErr => {
                        let component_err = self.intrinsic(Intrinsic::ComponentError);
                        let op = &operands[0];
                        uwriteln!(self.src, "const retCopy = {op};");
                        if let Some(f) = &self.post_return {
                            uwriteln!(
                                self.src,
                                "{}",
                                gen_post_return_js((format!("{f}(ret);"), None))
                            );
                        }
                        uwriteln!(
                            self.src,
                            "
                            if (typeof retCopy === 'object' && retCopy.tag === 'err') {{
                                throw new {component_err}(retCopy.val);
                            }}
                            return retCopy.val;
                            "
                        );
                    }

                    // (sync) Handle all other cases (including single parameter non-result<t>)
                    stack_value_count => {
                        let ret_val = match stack_value_count {
                            0 => unreachable!(
                                "unexpectedly zero return values for synchronous return"
                            ),
                            1 => operands[0].to_string(),
                            _ => format!("[{}]", operands.join(", ")),
                        };

                        // Handle the post return if necessary
                        if let Some(post_return_fn) = self.post_return {
                            // In the case there is a post return function, we'll want to copy the value
                            // then perform the post return before leaving

                            // Write out the assignment for the given return value
                            uwriteln!(self.src, "const retCopy = {ret_val};");

                            // Generate the JS that should perform the post return w/ the result
                            // and pass a copy fo the result to the actual caller
                            let post_return_js = gen_post_return_js((
                                format!("{post_return_fn}(ret);"),
                                Some("return retCopy;".into()),
                            ));

                            uwriteln!(self.src, "{post_return_js}",);
                        } else {
                            uwriteln!(self.src, "return {ret_val};",)
                        }
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

            Instruction::LengthStore { offset } => self.store("setUint32", *offset, operands),

            Instruction::LengthLoad { offset } => {
                self.load("getUint32", *offset, operands, results)
            }

            Instruction::PointerStore { offset } => self.store("setUint32", *offset, operands),

            Instruction::PointerLoad { offset } => {
                self.load("getUint32", *offset, operands, results)
            }

            Instruction::Malloc { size, align, .. } => {
                let tmp = self.tmp();
                let realloc = self.realloc.as_ref().unwrap();
                let ptr = format!("ptr{tmp}");
                uwriteln!(
                    self.src,
                    "var {ptr} = {realloc}(0, 0, {align}, {size});",
                    align = align.align_wasm32(),
                    size = size.size_wasm32()
                );
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
                        let rsc_table_remove = self
                            .intrinsic(Intrinsic::Resource(ResourceIntrinsic::ResourceTableRemove));
                        let rsc_flag = self
                            .intrinsic(Intrinsic::Resource(ResourceIntrinsic::ResourceTableFlag));
                        if !imported {
                            let symbol_resource_handle =
                                self.intrinsic(Intrinsic::SymbolResourceHandle);
                            uwriteln!(
                                self.src,
                                "var {rsc} = new.target === {local_name} ? this : Object.create({local_name}.prototype);"
                            );
                            if is_own {
                                // Sending an own handle out to JS as a return value - set up finalizer and disposal.
                                let empty_func = self
                                    .intrinsic(Intrinsic::JsHelper(JsHelperIntrinsic::EmptyFunc));
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
                                uwriteln!(
                                    self.src,
                                    "Object.defineProperty({rsc}, {symbol_resource_handle}, {{ writable: true, value: {handle} }});"
                                );
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
                            let cur_resource_borrows = self.intrinsic(Intrinsic::Resource(
                                ResourceIntrinsic::CurResourceBorrows,
                            ));
                            uwriteln!(self.src, "{cur_resource_borrows}.push({rsc});");
                            self.clear_resource_borrows = true;
                        }
                    }

                    ResourceData::Guest {
                        resource_name,
                        prefix,
                        extra,
                    } => {
                        assert!(
                            extra.is_none(),
                            "plain resource handles do not carry extra data"
                        );

                        let symbol_resource_handle =
                            self.intrinsic(Intrinsic::SymbolResourceHandle);
                        let prefix = prefix.as_deref().unwrap_or("");
                        let lower_camel = resource_name.to_lower_camel_case();

                        if !imported {
                            if is_own {
                                uwriteln!(
                                    self.src,
                                    "var {rsc} = repTable.get($resource_{prefix}rep${lower_camel}({handle})).rep;"
                                );
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
                                let cur_resource_borrows = self.intrinsic(Intrinsic::Resource(
                                    ResourceIntrinsic::CurResourceBorrows,
                                ));
                                uwriteln!(
                                    self.src,
                                    "{cur_resource_borrows}.push({{ rsc: {rsc}, drop: $resource_import${prefix}drop${lower_camel} }});"
                                );
                                self.clear_resource_borrows = true;
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
                                let empty_func = self
                                    .intrinsic(Intrinsic::JsHelper(JsHelperIntrinsic::EmptyFunc));
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
                                let rsc_flag = self.intrinsic(Intrinsic::Resource(
                                    ResourceIntrinsic::ResourceTableFlag,
                                ));
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

                            // Build the code to initialize the owned/borrowed resource handle
                            let handle_init_js = if is_own {
                                let create_own_fn = self.intrinsic(Intrinsic::Resource(
                                    ResourceIntrinsic::ResourceTableCreateOwn,
                                ));
                                format!("{handle} = {create_own_fn}(handleTable{tid}, rep);")
                            } else {
                                let scope_id = self.intrinsic(Intrinsic::ScopeId);
                                let create_borrow_fn = self.intrinsic(Intrinsic::Resource(
                                    ResourceIntrinsic::ResourceTableCreateBorrow,
                                ));
                                format!(
                                    "{handle} = {create_borrow_fn}(handleTable{tid}, rep, {scope_id});"
                                )
                            };

                            uwriteln!(
                                self.src,
                                "if (!{handle}) {{
                                    const rep = {op}[{symbol_resource_rep}] || ++captureCnt{rid};
                                    captureTable{rid}.set(rep, {op});
                                    {handle_init_js}
                                }}"
                            );
                        }
                    }

                    ResourceData::Guest {
                        resource_name,
                        prefix,
                        extra,
                    } => {
                        assert!(
                            extra.is_none(),
                            "plain resource handles do not carry extra data"
                        );

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

            Instruction::DropHandle { ty } => {
                let _ = ty;
                todo!("[Instruction::DropHandle] not yet implemented")
            }

            Instruction::Flush { amt } => {
                for item in operands.iter().take(*amt) {
                    results.push(item.clone());
                }
            }

            Instruction::ErrorContextLift => {
                let item = operands
                    .first()
                    .expect("unexpectedly missing ErrorContextLift arg");
                results.push(item.clone());
            }

            Instruction::ErrorContextLower => {
                let item = operands
                    .first()
                    .expect("unexpectedly missing ErrorContextLower arg");
                results.push(item.clone());
            }

            Instruction::FutureLower { .. } => {
                // TODO: convert this return of the lifted Future:
                //
                // ```
                //     return BigInt(writeEndIdx) << 32n | BigInt(readEndIdx);
                // ```
                //
                // Into a component-local Future instance
                //
                let future_arg = operands
                    .first()
                    .expect("unexpectedly missing ErrorContextLower arg");
                results.push(future_arg.clone());
            }

            Instruction::FutureLift { payload, ty } => {
                let future_ty = &crate::dealias(self.resolve, *ty);

                // TODO: we must generate the lifting function *before* function bindgen happens
                // (see commented async param lift code generation), because inside here
                // we do not have access to the interface types required to generate
                //
                // Alternatively, we can implement gen_flat_{lift,lower}_fn_js_expr for
                // TypeDefs with a resolve as well (and make sure the code works with either)
                //
                // TODO(breaking): consider adding more information to bindgen (pointer to component types?)
                match payload {
                    Some(payload_ty) => {
                        match payload_ty {
                            // TODO: reuse existing lifts
                            Type::Bool
                            | Type::U8
                            | Type::U16
                            | Type::U32
                            | Type::U64
                            | Type::S8
                            | Type::S16
                            | Type::S32
                            | Type::S64
                            | Type::F32
                            | Type::F64
                            | Type::Char
                            | Type::String
                            | Type::ErrorContext => uwriteln!(
                                self.src,
                                "const payloadLiftFn = () => {{ throw new Error('lift for {payload_ty:?}'); }}",
                            ),
                            Type::Id(payload_ty_id) => {
                                if self.resource_map.contains_key(payload_ty_id) {
                                    let ResourceTable { data, .. } =
                                        &self.resource_map[payload_ty_id];
                                    uwriteln!(
                                        self.src,
                                        "const payloadLiftFn = () => {{ throw new Error('lift for {} (identifier {})'); }}",
                                        payload_ty_id.index(),
                                        match data {
                                            ResourceData::Host { local_name, .. } => local_name,
                                            ResourceData::Guest { resource_name, .. } =>
                                                resource_name,
                                        }
                                    );
                                } else {
                                    // TODO: generate lift fns (see TODO above)
                                    // NOTE: the missing type here is normally a result with nested types...
                                    // the resource_map may not be indexing these properly
                                    //
                                    // eprintln!("warning: missing resource map def {:#?}", self.resolve.types[*payload_ty_id]);
                                }
                            }
                        };

                        // // TODO: save payload type size below and more information about the type w/ the future?
                        // let payload_ty_size = self.sizes.size(payload_ty).size_wasm32();

                        // NOTE: here, rather than create a new `Future` "resource" using the saved
                        // ResourceData, we use the future.new intrinsic directly.
                        //
                        // TODO: differentiate "locally" created futures and futures that are lifted in?
                        //
                        let tmp = self.tmp();
                        let result_var = format!("futureResult{tmp}");
                        let component_idx = self.canon_opts.instance.as_u32();
                        let future_new_fn =
                            self.intrinsic(Intrinsic::AsyncFuture(AsyncFutureIntrinsic::FutureNew));
                        uwriteln!(
                            self.src,
                            "const {result_var} = {future_new_fn}({{ componentIdx: {component_idx}, futureTypeRep: {} }});",
                            future_ty.index(),
                        );
                        results.push(result_var.clone());
                    }

                    None => unreachable!("future with no payload unsupported"),
                }
            }

            Instruction::StreamLower { .. } => {
                // TODO: convert this return of the lifted Future:
                // ```
                //     return BigInt(writeEndIdx) << 32n | BigInt(readEndIdx);
                // ```
                //
                // Into a component-local Future instance
                //
                let stream_arg = operands
                    .first()
                    .expect("unexpectedly missing StreamLower arg");
                results.push(stream_arg.clone());
            }

            Instruction::StreamLift { payload, ty } => {
                let component_idx = self.canon_opts.instance.as_u32();
                let stream_new_from_lift_fn = self.intrinsic(Intrinsic::AsyncStream(
                    AsyncStreamIntrinsic::StreamNewFromLift,
                ));

                // We must look up the type idx to find the stream
                let type_id = &crate::dealias(self.resolve, *ty);
                let ResourceTable {
                    imported: true,
                    data:
                        ResourceData::Guest {
                            extra:
                                Some(ResourceExtraData::Stream {
                                    table_idx: stream_table_idx_ty,
                                    elem_ty: stream_element_ty,
                                }),
                            ..
                        },
                } = self
                    .resource_map
                    .get(type_id)
                    .expect("missing resource mapping for stream lift")
                else {
                    unreachable!("invalid resource table observed during stream lift");
                };

                assert_eq!(
                    *stream_element_ty, **payload,
                    "stream element type mismatch"
                );

                let arg_stream_end_idx = operands
                    .first()
                    .expect("unexpectedly missing stream table idx arg in StreamLift");

                let (payload_lift_fn, payload_lower_fn) = match payload {
                    None => ("null".into(), "null".into()),
                    Some(payload_ty) => {
                        match payload_ty {
                            // TODO: reuse existing lifts
                            Type::Bool
                            | Type::U8
                            | Type::U16
                            | Type::U32
                            | Type::U64
                            | Type::S8
                            | Type::S16
                            | Type::S32
                            | Type::S64
                            | Type::F32
                            | Type::F64
                            | Type::Char
                            | Type::String
                            | Type::ErrorContext => (
                                format!(
                                    "const payloadLiftFn = () => {{ throw new Error('lift for {payload_ty:?}'); }};"
                                ),
                                format!(
                                    "const payloadLowerFn = () => {{ throw new Error('lower for {payload_ty:?}'); }};"
                                ),
                            ),

                            Type::Id(payload_ty_id) => {
                                if let Some(ResourceTable { data, .. }) =
                                    &self.resource_map.get(payload_ty_id)
                                {
                                    let identifier = match data {
                                        ResourceData::Host { local_name, .. } => local_name,
                                        ResourceData::Guest { resource_name, .. } => resource_name,
                                    };

                                    (
                                        format!(
                                            "const payloadLiftFn = () => {{ throw new Error('lift for {} (identifier {identifier})'); }};",
                                            payload_ty_id.index(),
                                        ),
                                        format!(
                                            "const payloadLowerFn = () => {{ throw new Error('lower for {} (identifier {identifier})'); }};",
                                            payload_ty_id.index(),
                                        ),
                                    )
                                } else {
                                    (
                                        format!(
                                            "const payloadLiftFn = () => {{ throw new Error('lift for missing type with type idx {payload_ty:?}'); }};",
                                        ),
                                        format!(
                                            "const payloadLowerFn = () => {{ throw new Error('lower for missing type with type idx {payload_ty:?}'); }};",
                                        ),
                                    )
                                }
                            }
                        }
                    }
                };

                let payload_ty_size_js = if let Some(payload_ty) = payload {
                    self.sizes.size(payload_ty).size_wasm32().to_string()
                } else {
                    "null".into()
                };

                let stream_table_idx = stream_table_idx_ty.as_u32();
                let is_unit_stream = payload.is_none();

                let tmp = self.tmp();
                let result_var = format!("streamResult{tmp}");
                uwriteln!(
                    self.src,
                    "
                    {payload_lift_fn}
                    {payload_lower_fn}
                    const {result_var} = {stream_new_from_lift_fn}({{
                        componentIdx: {component_idx},
                        streamTableIdx: {stream_table_idx},
                        streamEndIdx: {arg_stream_end_idx},
                        payloadLiftFn,
                        payloadTypeSize32: {payload_ty_size_js},
                        payloadLowerFn,
                        isUnitStream: {is_unit_stream},
                    }});",
                );
                results.push(result_var.clone());
            }

            // Instruction::AsyncTaskReturn does *not* correspond to an canonical `task.return`,
            // but rather to a "return"/exit from an a lifted async function (e.g. pre-callback)
            //
            // To control the *real* `task.return` intrinsic:
            //   - `Intrinsic::TaskReturn`
            //   - `AsyncTaskIntrinsic::TaskReturn`
            //
            // This is simply the end of the async function definition (e.g. `CallWasm`) that has been
            // lifted, which contains information about the async state.
            //
            // For an async function 'some-func', this instruction is triggered w/ the following `name`s:
            // - '[task-return]some-func'
            //
            // At this point in code generation, the following things have already been set:
            // - `parentTask`: A parent task, if one was executing before
            // - `subtask`: A subtask, if the current task is a subtask of a parent task
            // - `task`: the currently executing task
            // - `ret`: the original function return value, via (i.e. via `CallWasm`/`CallInterface`)
            // - `hostProvided`: whether the original function was a host-provided (i.e. host provided import)
            //
            Instruction::AsyncTaskReturn { name, params } => {
                let debug_log_fn = self.intrinsic(Intrinsic::DebugLog);
                uwriteln!(
                    self.src,
                    "{debug_log_fn}('{prefix}  [Instruction::AsyncTaskReturn]', {{
                         funcName: '{name}',
                         paramCount: {param_count},
                         postReturn: {post_return_present},
                         hostProvided,
                      }});",
                    param_count = params.len(),
                    post_return_present = self.post_return.is_some(),
                    prefix = self.tracing_prefix,
                );

                assert!(
                    self.is_async,
                    "non-async functions should not be performing async returns (func {name})",
                );

                // If we're dealing with an async call, then `ret` is actually the
                // state of async behavior.
                //
                // The result *should* be a Promise that resolves to whatever the current task
                // will eventually resolve to.
                //
                // NOTE: Regardless of whether async porcelain is required here, we want to return the result
                // of the computation as a whole, not the current async state (which is what `ret` currently is).
                //
                // `ret` is only a Promise if we have async-lowered the function in question (e.g. via JSPI)
                //
                // ```ts
                // type ret = number | Promise<number>;
                let async_driver_loop_fn =
                    self.intrinsic(Intrinsic::AsyncTask(AsyncTaskIntrinsic::DriverLoop));
                let get_or_create_async_state_fn = self.intrinsic(Intrinsic::Component(
                    ComponentIntrinsic::GetOrCreateAsyncState,
                ));
                let end_current_task_fn =
                    self.intrinsic(Intrinsic::AsyncTask(AsyncTaskIntrinsic::EndCurrentTask));

                let component_instance_idx = self.canon_opts.instance.as_u32();
                let is_async_js = self.requires_async_porcelain | self.is_async;

                // NOTE: if the import was host provided we *already* have the result via
                // JSPI and simply calling the host provided JS function -- there is no need
                // to drive the async loop as with an async import that came from a component.
                //
                // If a subtask is defined, then we're in the case of a lowered async import,
                // which means that the first async call (to the callee fn) has occurred,
                // and a subtask has been created, but has not been triggered as started.
                //
                // NOTE: for host provided functions, we know that the resolution fo the
                // function itself are the lifted (component model -- i.e. a string not a pointer + len)
                // results. In those cases, we can simply return the result that was provided by the host.
                //
                // Alternatively, if we have entered an async return, and are part of a subtask
                // then we should start it, given that the task we have recently created (however we got to
                // the async return) is going to continue to be polled soon (via the driver loop).
                //
                uwriteln!(
                    self.src,
                    r#"
                      if (hostProvided) {{
                          {debug_log_fn}('[Instruction::AsyncTaskReturn] signaling host-provided async return completion', {{
                              task: task.id(),
                              subtask: subtask?.id(),
                              result: ret,
                          }})
                          task.resolve([ret]);
                          {end_current_task_fn}({component_instance_idx}, task.id());
                          return task.completionPromise();
                      }}

                      const currentSubtask = task.getLatestSubtask();
                      if (currentSubtask && currentSubtask.isNotStarted()) {{
                          {debug_log_fn}('[Instruction::AsyncTaskReturn] subtask not started at end of task run, starting it', {{
                              task: task.id(),
                              subtask: currentSubtask?.id(),
                              result: ret,
                          }})
                          currentSubtask.onStart();
                      }}

                      const componentState = {get_or_create_async_state_fn}({component_instance_idx});
                      if (!componentState) {{ throw new Error('failed to lookup current component state'); }}

                      new Promise(async (resolve, reject) => {{
                          try {{
                              {debug_log_fn}("[Instruction::AsyncTaskReturn] starting driver loop", {{ fnName: '{name}' }});
                              await {async_driver_loop_fn}({{
                                  componentInstanceIdx: {component_instance_idx},
                                  componentState,
                                  task,
                                  fnName: '{name}',
                                  isAsync: {is_async_js},
                                  callbackResult: ret,
                                  resolve,
                                  reject
                              }});
                          }} catch (err) {{
                              {debug_log_fn}("[Instruction::AsyncTaskReturn] driver loop call failure", {{ err }});
                          }}
                      }});

                      let taskRes = await task.completionPromise();
                      if (task.getErrHandling() === 'throw-result-err') {{
                          if (typeof taskRes !== 'object') {{ return taskRes; }}
                          if (taskRes.tag === 'err') {{ throw taskRes.val; }}
                          if (taskRes.tag === 'ok') {{ taskRes = taskRes.val; }}
                      }}

                      return taskRes;
                      "#,
                );
            }

            Instruction::GuestDeallocate { .. }
            | Instruction::GuestDeallocateString
            | Instruction::GuestDeallocateList { .. }
            | Instruction::GuestDeallocateVariant { .. } => unimplemented!("Guest deallocation"),

            Instruction::FixedLengthListLift { .. }
            | Instruction::FixedLengthListLiftFromMemory { .. }
            | Instruction::FixedLengthListLower { .. }
            | Instruction::FixedLengthListLowerToMemory { .. } => {
                unimplemented!("Fixed length lists")
            }
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

/// Retrieve the specialized JS array type that would contain a given element type,
/// if one exists.
///
/// e.g. a Wasm [`Type::U8`] would be represetned by a JS `Uint8Array`
///
/// # Arguments
///
/// * `resolve` - The [`Resolve`] used to look up nested type IDs if necessary
/// * `element_ty` - The [`Type`] that represents elements of the array
pub fn js_array_ty(resolve: &Resolve, element_ty: &Type) -> Option<&'static str> {
    match element_ty {
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
        Type::ErrorContext => None,
        Type::Id(id) => match &resolve.types[*id].kind {
            // Recur to resolve type aliases, etc.
            TypeDefKind::Type(t) => js_array_ty(resolve, t),
            _ => None,
        },
    }
}
