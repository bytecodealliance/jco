use heck::*;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fmt::Write;
use std::mem;
use wit_bindgen_core::wit_parser::abi::{
    AbiVariant, Bindgen, Bitcast, Instruction, LiftLower, WasmType,
};
use wit_bindgen_core::{wit_parser::*, Direction, Files, Generator};

#[derive(Default)]
pub struct Js {
    src: Source,
    in_import: bool,
    opts: Opts,
    guest_imports: HashMap<String, Imports>,
    guest_exports: HashMap<String, Exports>,
    sizes: SizeAlign,
    intrinsics: BTreeMap<Intrinsic, String>,
    all_intrinsics: BTreeSet<Intrinsic>,
    needs_get_export: bool,
    needs_ty_option: bool,
    needs_ty_result: bool,
}

#[derive(Default)]
struct Imports {
    freestanding_funcs: Vec<(String, Source)>,
}

#[derive(Default)]
struct Exports {
    freestanding_funcs: Vec<Source>,
}

#[derive(Default, Debug, Clone)]
#[cfg_attr(feature = "clap", derive(clap::Args))]
pub struct Opts {
    #[cfg_attr(feature = "clap", arg(long = "no-typescript"))]
    pub no_typescript: bool,
}

impl Opts {
    pub fn build(self) -> Js {
        let mut r = Js::new();
        r.opts = self;
        r
    }
}

#[derive(Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
enum Intrinsic {
    ClampGuest,
    DataView,
    ValidateGuestChar,
    ValidateHostChar,
    /// Implementation of https://tc39.es/ecma262/#sec-toint32.
    ToInt32,
    /// Implementation of https://tc39.es/ecma262/#sec-touint32.
    ToUint32,
    /// Implementation of https://tc39.es/ecma262/#sec-toint16.
    ToInt16,
    /// Implementation of https://tc39.es/ecma262/#sec-touint16.
    ToUint16,
    /// Implementation of https://tc39.es/ecma262/#sec-toint8.
    ToInt8,
    /// Implementation of https://tc39.es/ecma262/#sec-touint8.
    ToUint8,
    /// Implementation of https://tc39.es/ecma262/#sec-tobigint64.
    ToBigInt64,
    /// Implementation of https://tc39.es/ecma262/#sec-tobiguint64.
    ToBigUint64,
    /// Implementation of https://tc39.es/ecma262/#sec-tostring.
    ToString,
    I32ToF32,
    F32ToI32,
    I64ToF64,
    F64ToI64,
    Utf8Decoder,
    Utf8Encode,
    Utf8EncodedLen,
    Slab,
    Promises,
    ThrowInvalidBool,
}

impl Intrinsic {
    fn name(&self) -> &'static str {
        match self {
            Intrinsic::ClampGuest => "clamp_guest",
            Intrinsic::DataView => "data_view",
            Intrinsic::ValidateGuestChar => "validate_guest_char",
            Intrinsic::ValidateHostChar => "validate_host_char",
            Intrinsic::ToInt32 => "to_int32",
            Intrinsic::ToUint32 => "to_uint32",
            Intrinsic::ToInt16 => "to_int16",
            Intrinsic::ToUint16 => "to_uint16",
            Intrinsic::ToInt8 => "to_int8",
            Intrinsic::ToUint8 => "to_uint8",
            Intrinsic::ToBigInt64 => "to_int64",
            Intrinsic::ToBigUint64 => "to_uint64",
            Intrinsic::ToString => "to_string",
            Intrinsic::F32ToI32 => "f32ToI32",
            Intrinsic::I32ToF32 => "i32ToF32",
            Intrinsic::F64ToI64 => "f64ToI64",
            Intrinsic::I64ToF64 => "i64ToF64",
            Intrinsic::Utf8Decoder => "UTF8_DECODER",
            Intrinsic::Utf8Encode => "utf8_encode",
            Intrinsic::Utf8EncodedLen => "UTF8_ENCODED_LEN",
            Intrinsic::Slab => "Slab",
            Intrinsic::Promises => "PROMISES",
            Intrinsic::ThrowInvalidBool => "throw_invalid_bool",
        }
    }
}

impl Js {
    pub fn new() -> Js {
        Js::default()
    }

    fn abi_variant(dir: Direction) -> AbiVariant {
        // This generator uses a reversed mapping! In the JS host-side
        // bindings, we don't use any extra adapter layer between guest wasm
        // modules and the host. When the guest imports functions using the
        // `GuestImport` ABI, the host directly implements the `GuestImport`
        // ABI, even though the host is *exporting* functions. Similarly, when
        // the guest exports functions using the `GuestExport` ABI, the host
        // directly imports them with the `GuestExport` ABI, even though the
        // host is *importing* functions.
        match dir {
            Direction::Import => AbiVariant::GuestExport,
            Direction::Export => AbiVariant::GuestImport,
        }
    }

    fn array_ty(&self, iface: &Interface, ty: &Type) -> Option<&'static str> {
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
            Type::Float32 => Some("Float32Array"),
            Type::Float64 => Some("Float64Array"),
            Type::Char => None,
            Type::String => None,
            Type::Id(id) => match &iface.types[*id].kind {
                TypeDefKind::Type(t) => self.array_ty(iface, t),
                _ => None,
            },
        }
    }

    fn print_ty(&mut self, iface: &Interface, ty: &Type) {
        match ty {
            Type::Bool => self.src.ts("boolean"),
            Type::U8
            | Type::S8
            | Type::U16
            | Type::S16
            | Type::U32
            | Type::S32
            | Type::Float32
            | Type::Float64 => self.src.ts("number"),
            Type::U64 | Type::S64 => self.src.ts("bigint"),
            Type::Char => self.src.ts("string"),
            Type::String => self.src.ts("string"),
            Type::Id(id) => {
                let ty = &iface.types[*id];
                if let Some(name) = &ty.name {
                    return self.src.ts(&name.to_upper_camel_case());
                }
                match &ty.kind {
                    TypeDefKind::Type(t) => self.print_ty(iface, t),
                    TypeDefKind::Tuple(t) => self.print_tuple(iface, t),
                    TypeDefKind::Record(_) => panic!("anonymous record"),
                    TypeDefKind::Flags(_) => panic!("anonymous flags"),
                    TypeDefKind::Enum(_) => panic!("anonymous enum"),
                    TypeDefKind::Union(_) => panic!("anonymous union"),
                    TypeDefKind::Option(t) => {
                        if self.maybe_null(iface, t) {
                            self.needs_ty_option = true;
                            self.src.ts("Option<");
                            self.print_ty(iface, t);
                            self.src.ts(">");
                        } else {
                            self.print_ty(iface, t);
                            self.src.ts(" | null");
                        }
                    }
                    TypeDefKind::Result(r) => {
                        self.needs_ty_result = true;
                        self.src.ts("Result<");
                        self.print_optional_ty(iface, r.ok.as_ref());
                        self.src.ts(", ");
                        self.print_optional_ty(iface, r.err.as_ref());
                        self.src.ts(">");
                    }
                    TypeDefKind::Variant(_) => panic!("anonymous variant"),
                    TypeDefKind::List(v) => self.print_list(iface, v),
                    TypeDefKind::Future(_) => todo!("anonymous future"),
                    TypeDefKind::Stream(_) => todo!("anonymous stream"),
                }
            }
        }
    }

    fn print_optional_ty(&mut self, iface: &Interface, ty: Option<&Type>) {
        match ty {
            Some(ty) => self.print_ty(iface, ty),
            None => self.src.ts("void"),
        }
    }

    fn print_list(&mut self, iface: &Interface, ty: &Type) {
        match self.array_ty(iface, ty) {
            Some(ty) => self.src.ts(ty),
            None => {
                self.print_ty(iface, ty);
                self.src.ts("[]");
            }
        }
    }

    fn print_tuple(&mut self, iface: &Interface, tuple: &Tuple) {
        self.src.ts("[");
        for (i, ty) in tuple.types.iter().enumerate() {
            if i > 0 {
                self.src.ts(", ");
            }
            self.print_ty(iface, ty);
        }
        self.src.ts("]");
    }

    fn docs_raw(&mut self, docs: &str) {
        self.src.ts("/**\n");
        for line in docs.lines() {
            self.src.ts(&format!(" * {}\n", line));
        }
        self.src.ts(" */\n");
    }

    fn docs(&mut self, docs: &Docs) {
        match &docs.contents {
            Some(docs) => self.docs_raw(docs),
            None => return,
        }
    }

    fn ts_func(&mut self, iface: &Interface, func: &Function) {
        self.docs(&func.docs);

        self.src.ts(&func.item_name().to_lower_camel_case());
        self.src.ts("(");

        let param_start = match &func.kind {
            FunctionKind::Freestanding => 0,
        };

        for (i, (name, ty)) in func.params[param_start..].iter().enumerate() {
            if i > 0 {
                self.src.ts(", ");
            }
            self.src.ts(to_js_ident(&name.to_lower_camel_case()));
            self.src.ts(": ");
            self.print_ty(iface, ty);
        }
        self.src.ts("): ");
        match func.results.len() {
            0 => self.src.ts("void"),
            1 => self.print_ty(iface, func.results.iter_types().next().unwrap()),
            _ => {
                self.src.ts("[");
                for (i, ty) in func.results.iter_types().enumerate() {
                    if i != 0 {
                        self.src.ts(", ");
                    }
                    self.print_ty(iface, ty);
                }
                self.src.ts("]");
            }
        }
        self.src.ts(";\n");
    }

    fn intrinsic(&mut self, i: Intrinsic) -> String {
        if let Some(name) = self.intrinsics.get(&i) {
            return name.clone();
        }
        // TODO: should select a name that automatically doesn't conflict with
        // anything else being generated.
        self.intrinsics.insert(i, i.name().to_string());
        return i.name().to_string();
    }

    /// Returns whether `null` is a valid value of type `ty`
    fn maybe_null(&self, iface: &Interface, ty: &Type) -> bool {
        self.as_nullable(iface, ty).is_some()
    }

    /// Tests whether `ty` can be represented with `null`, and if it can then
    /// the "other type" is returned. If `Some` is returned that means that `ty`
    /// is `null | <return>`. If `None` is returned that means that `null` can't
    /// be used to represent `ty`.
    fn as_nullable<'a>(&self, iface: &'a Interface, ty: &'a Type) -> Option<&'a Type> {
        let id = match ty {
            Type::Id(id) => *id,
            _ => return None,
        };
        match &iface.types[id].kind {
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
                if !self.maybe_null(iface, t) {
                    Some(t)
                } else {
                    None
                }
            }
            TypeDefKind::Type(t) => self.as_nullable(iface, t),
            _ => None,
        }
    }
}

impl Generator for Js {
    fn preprocess_one(&mut self, iface: &Interface, dir: Direction) {
        let variant = Self::abi_variant(dir);
        self.sizes.fill(iface);
        self.in_import = variant == AbiVariant::GuestImport;
    }

    fn type_record(
        &mut self,
        iface: &Interface,
        _id: TypeId,
        name: &str,
        record: &Record,
        docs: &Docs,
    ) {
        self.docs(docs);
        self.src.ts(&format!(
            "export interface {} {{\n",
            name.to_upper_camel_case()
        ));
        for field in record.fields.iter() {
            self.docs(&field.docs);
            let (option_str, ty) = self
                .as_nullable(iface, &field.ty)
                .map_or(("", &field.ty), |ty| ("?", ty));
            self.src.ts(&format!(
                "{}{}: ",
                field.name.to_lower_camel_case(),
                option_str
            ));
            self.print_ty(iface, ty);
            self.src.ts(",\n");
        }
        self.src.ts("}\n");
    }

    fn type_tuple(
        &mut self,
        iface: &Interface,
        _id: TypeId,
        name: &str,
        tuple: &Tuple,
        docs: &Docs,
    ) {
        self.docs(docs);
        self.src
            .ts(&format!("export type {} = ", name.to_upper_camel_case()));
        self.print_tuple(iface, tuple);
        self.src.ts(";\n");
    }

    fn type_flags(
        &mut self,
        _iface: &Interface,
        _id: TypeId,
        name: &str,
        flags: &Flags,
        docs: &Docs,
    ) {
        self.docs(docs);
        self.src.ts(&format!(
            "export interface {} {{\n",
            name.to_upper_camel_case()
        ));
        for flag in flags.flags.iter() {
            self.docs(&flag.docs);
            let name = flag.name.to_lower_camel_case();
            self.src.ts(&format!("{name}?: boolean,\n"));
        }
        self.src.ts("}\n");
    }

    fn type_variant(
        &mut self,
        iface: &Interface,
        _id: TypeId,
        name: &str,
        variant: &Variant,
        docs: &Docs,
    ) {
        self.docs(docs);
        self.src
            .ts(&format!("export type {} = ", name.to_upper_camel_case()));
        for (i, case) in variant.cases.iter().enumerate() {
            if i > 0 {
                self.src.ts(" | ");
            }
            self.src
                .ts(&format!("{}_{}", name, case.name).to_upper_camel_case());
        }
        self.src.ts(";\n");
        for case in variant.cases.iter() {
            self.docs(&case.docs);
            self.src.ts(&format!(
                "export interface {} {{\n",
                format!("{}_{}", name, case.name).to_upper_camel_case()
            ));
            self.src.ts("tag: \"");
            self.src.ts(&case.name);
            self.src.ts("\",\n");
            if let Some(ty) = case.ty {
                self.src.ts("val: ");
                self.print_ty(iface, &ty);
                self.src.ts(",\n");
            }
            self.src.ts("}\n");
        }
    }

    fn type_union(
        &mut self,
        iface: &Interface,
        _id: TypeId,
        name: &str,
        union: &Union,
        docs: &Docs,
    ) {
        self.docs(docs);
        let name = name.to_upper_camel_case();
        self.src.ts(&format!("export type {name} = "));
        for i in 0..union.cases.len() {
            if i > 0 {
                self.src.ts(" | ");
            }
            self.src.ts(&format!("{name}{i}"));
        }
        self.src.ts(";\n");
        for (i, case) in union.cases.iter().enumerate() {
            self.docs(&case.docs);
            self.src.ts(&format!("export interface {name}{i} {{\n"));
            self.src.ts(&format!("tag: {i},\n"));
            self.src.ts("val: ");
            self.print_ty(iface, &case.ty);
            self.src.ts(",\n");
            self.src.ts("}\n");
        }
    }

    fn type_option(
        &mut self,
        iface: &Interface,
        _id: TypeId,
        name: &str,
        payload: &Type,
        docs: &Docs,
    ) {
        self.docs(docs);
        let name = name.to_upper_camel_case();
        self.src.ts(&format!("export type {name} = "));
        if self.maybe_null(iface, payload) {
            self.needs_ty_option = true;
            self.src.ts("Option<");
            self.print_ty(iface, payload);
            self.src.ts(">");
        } else {
            self.print_ty(iface, payload);
            self.src.ts(" | null");
        }
        self.src.ts(";\n");
    }

    fn type_result(
        &mut self,
        iface: &Interface,
        _id: TypeId,
        name: &str,
        result: &Result_,
        docs: &Docs,
    ) {
        self.docs(docs);
        let name = name.to_upper_camel_case();
        self.needs_ty_result = true;
        self.src.ts(&format!("export type {name} = Result<"));
        self.print_optional_ty(iface, result.ok.as_ref());
        self.src.ts(", ");
        self.print_optional_ty(iface, result.err.as_ref());
        self.src.ts(">;\n");
    }

    fn type_enum(
        &mut self,
        _iface: &Interface,
        _id: TypeId,
        name: &str,
        enum_: &Enum,
        docs: &Docs,
    ) {
        // The complete documentation for this enum, including documentation for variants.
        let mut complete_docs = String::new();

        if let Some(docs) = &docs.contents {
            complete_docs.push_str(docs);
            // Add a gap before the `# Variants` section.
            complete_docs.push('\n');
        }

        writeln!(complete_docs, "# Variants").unwrap();

        for case in enum_.cases.iter() {
            writeln!(complete_docs).unwrap();
            writeln!(complete_docs, "## `\"{}\"`", case.name).unwrap();

            if let Some(docs) = &case.docs.contents {
                writeln!(complete_docs).unwrap();
                complete_docs.push_str(docs);
            }
        }

        self.docs_raw(&complete_docs);

        self.src
            .ts(&format!("export type {} = ", name.to_upper_camel_case()));
        for (i, case) in enum_.cases.iter().enumerate() {
            if i != 0 {
                self.src.ts(" | ");
            }
            self.src.ts(&format!("\"{}\"", case.name));
        }
        self.src.ts(";\n");
    }

    fn type_alias(&mut self, iface: &Interface, _id: TypeId, name: &str, ty: &Type, docs: &Docs) {
        self.docs(docs);
        self.src
            .ts(&format!("export type {} = ", name.to_upper_camel_case()));
        self.print_ty(iface, ty);
        self.src.ts(";\n");
    }

    fn type_list(&mut self, iface: &Interface, _id: TypeId, name: &str, ty: &Type, docs: &Docs) {
        self.docs(docs);
        self.src
            .ts(&format!("export type {} = ", name.to_upper_camel_case()));
        self.print_list(iface, ty);
        self.src.ts(";\n");
    }

    fn type_builtin(&mut self, iface: &Interface, _id: TypeId, name: &str, ty: &Type, docs: &Docs) {
        drop((iface, _id, name, ty, docs));
    }

    // As with `abi_variant` above, we're generating host-side bindings here
    // so a user "export" uses the "guest import" ABI variant on the inside of
    // this `Generator` implementation.
    fn export(&mut self, iface: &Interface, func: &Function) {
        let prev = mem::take(&mut self.src);

        let sig = iface.wasm_signature(AbiVariant::GuestImport, func);
        let params = (0..sig.params.len())
            .map(|i| format!("arg{}", i))
            .collect::<Vec<_>>();
        self.src
            .js(&format!("function({}) {{\n", params.join(", ")));
        self.ts_func(iface, func);

        let mut f = FunctionBindgen::new(self, params);
        iface.call(
            AbiVariant::GuestImport,
            LiftLower::LiftArgsLowerResults,
            func,
            &mut f,
        );

        let FunctionBindgen {
            src,
            needs_memory,
            needs_realloc,
            ..
        } = f;

        if needs_memory {
            self.needs_get_export = true;
            // TODO: hardcoding "memory"
            self.src.js("const memory = get_export(\"memory\");\n");
        }

        if let Some(name) = needs_realloc {
            self.needs_get_export = true;
            self.src
                .js(&format!("const realloc = get_export(\"{}\");\n", name));
        }

        self.src.js(&src.js);

        self.src.js("}");

        let src = mem::replace(&mut self.src, prev);
        let imports = self
            .guest_imports
            .entry(iface.name.to_string())
            .or_insert(Imports::default());
        let dst = match &func.kind {
            FunctionKind::Freestanding => &mut imports.freestanding_funcs,
        };
        dst.push((func.name.to_string(), src));
    }

    // As with `abi_variant` above, we're generating host-side bindings here
    // so a user "import" uses the "export" ABI variant on the inside of
    // this `Generator` implementation.
    fn import(&mut self, iface: &Interface, func: &Function) {
        let prev = mem::take(&mut self.src);

        let params = func
            .params
            .iter()
            .enumerate()
            .map(|(i, _)| format!("arg{}", i))
            .collect::<Vec<_>>();
        let src_object = match &func.kind {
            FunctionKind::Freestanding => "this".to_string(),
        };
        self.src.js(&format!(
            "{}({}) {{\n",
            func.item_name().to_lower_camel_case(),
            params.join(", ")
        ));
        self.ts_func(iface, func);

        let mut f = FunctionBindgen::new(self, params);
        f.src_object = src_object;
        iface.call(
            AbiVariant::GuestExport,
            LiftLower::LowerArgsLiftResults,
            func,
            &mut f,
        );

        let FunctionBindgen {
            src,
            needs_memory,
            needs_realloc,
            src_object,
            ..
        } = f;
        if needs_memory {
            // TODO: hardcoding "memory"
            self.src
                .js(&format!("const memory = {}._exports.memory;\n", src_object));
        }

        if let Some(name) = needs_realloc {
            self.src.js(&format!(
                "const realloc = {}._exports[\"{}\"];\n",
                src_object, name
            ));
        }

        self.src.js(&src.js);
        self.src.js("}\n");

        let exports = self
            .guest_exports
            .entry(iface.name.to_string())
            .or_insert_with(Exports::default);

        let func_body = mem::replace(&mut self.src, prev);
        match &func.kind {
            FunctionKind::Freestanding => {
                exports.freestanding_funcs.push(func_body);
            }
        }
    }

    fn finish_one(&mut self, iface: &Interface, files: &mut Files) {
        for (module, funcs) in mem::take(&mut self.guest_imports) {
            // TODO: `module.exports` vs `export function`
            self.src.js(&format!(
                "export function add{}ToImports(imports, obj{}) {{\n",
                module.to_upper_camel_case(),
                if self.needs_get_export {
                    ", get_export"
                } else {
                    ""
                },
            ));
            self.src.ts(&format!(
                "export function add{}ToImports(imports: any, obj: {0}{}): void;\n",
                module.to_upper_camel_case(),
                if self.needs_get_export {
                    ", get_export: (name: string) => WebAssembly.ExportValue"
                } else {
                    ""
                },
            ));
            self.src.js(&format!(
                "if (!(\"{0}\" in imports)) imports[\"{0}\"] = {{}};\n",
                module,
            ));

            self.src.ts(&format!(
                "export interface {} {{\n",
                module.to_upper_camel_case()
            ));

            for (name, src) in funcs.freestanding_funcs.iter() {
                self.src.js(&format!(
                    "imports[\"{module}\"][\"{name}\"] = {};\n",
                    src.js.trim()
                ));
                self.src.ts(&src.ts);
            }

            self.src.js("}");
            self.src.ts("}\n");
        }

        let imports = mem::take(&mut self.src);

        for (module, exports) in mem::take(&mut self.guest_exports) {
            let module = module.to_upper_camel_case();
            self.src.ts(&format!("export class {} {{\n", module));
            self.src.js(&format!("export class {} {{\n", module));

            self.src.ts("
               /**
                * The WebAssembly instance that this class is operating with.
                * This is only available after the `instantiate` method has
                * been called.
                */
                instance: WebAssembly.Instance;
            ");

            self.src.ts(&format!(
                "
                   /**
                    * Initializes this object with the provided WebAssembly
                    * module/instance.
                    *
                    * This is intended to be a flexible method of instantiating
                    * and completion of the initialization of this class. This
                    * method must be called before interacting with the
                    * WebAssembly object.
                    *
                    * The first argument to this method is where to get the
                    * wasm from. This can be a whole bunch of different types,
                    * for example:
                    *
                    * * A precompiled `WebAssembly.Module`
                    * * A typed array buffer containing the wasm bytecode.
                    * * A `Promise` of a `Response` which is used with
                    *   `instantiateStreaming`
                    * * A `Response` itself used with `instantiateStreaming`.
                    * * An already instantiated `WebAssembly.Instance`
                    *
                    * If necessary the module is compiled, and if necessary the
                    * module is instantiated. Whether or not it's necessary
                    * depends on the type of argument provided to
                    * instantiation.
                    *
                    * If instantiation is performed then the `imports` object
                    * passed here is the list of imports used to instantiate
                    * the instance. This method may add its own intrinsics to
                    * this `imports` object too.
                    */
                    instantiate(
                        module: WebAssembly.Module | BufferSource | Promise<Response> | Response | WebAssembly.Instance,
                        imports?: any,
                    ): Promise<void>;
                ",
            ));
            self.src.js("
                async instantiate(module, imports) {
                    imports = imports || {};
            ");

            // With intrinsics prep'd we can now instantiate the module. JS has
            // a ... variety of methods of instantiation, so we basically just
            // try to be flexible here.
            self.src.js("
                if (module instanceof WebAssembly.Instance) {
                    this.instance = module;
                } else if (module instanceof WebAssembly.Module) {
                    this.instance = await WebAssembly.instantiate(module, imports);
                } else if (module instanceof ArrayBuffer || module instanceof Uint8Array) {
                    const { instance } = await WebAssembly.instantiate(module, imports);
                    this.instance = instance;
                } else {
                    const { instance } = await WebAssembly.instantiateStreaming(module, imports);
                    this.instance = instance;
                }
                this._exports = this.instance.exports;
            ");
            self.src.js("}\n");

            for func in exports.freestanding_funcs.iter() {
                self.src.js(&func.js);
                self.src.ts(&func.ts);
            }
            self.src.ts("}\n");
            self.src.js("}\n");
        }

        let exports = mem::take(&mut self.src);

        if mem::take(&mut self.needs_ty_option) {
            self.src
                .ts("export type Option<T> = { tag: \"none\" } | { tag: \"some\", val; T };\n");
        }
        if mem::take(&mut self.needs_ty_result) {
            self.src.ts(
                "export type Result<T, E> = { tag: \"ok\", val: T } | { tag: \"err\", val: E };\n",
            );
        }

        if self.intrinsics.len() > 0 {
            self.src.js("import { ");
            for (i, (intrinsic, name)) in mem::take(&mut self.intrinsics).into_iter().enumerate() {
                if i > 0 {
                    self.src.js(", ");
                }
                self.src.js(intrinsic.name());
                if intrinsic.name() != name {
                    self.src.js(" as ");
                    self.src.js(&name);
                }
                self.all_intrinsics.insert(intrinsic);
            }
            self.src.js(" } from './intrinsics.js';\n");
        }

        self.src.js(&imports.js);
        self.src.ts(&imports.ts);
        self.src.js(&exports.js);
        self.src.ts(&exports.ts);

        let src = mem::take(&mut self.src);
        let name = iface.name.to_kebab_case();
        files.push(&format!("{}.js", name), src.js.as_bytes());
        if !self.opts.no_typescript {
            files.push(&format!("{}.d.ts", name), src.ts.as_bytes());
        }
    }

    fn finish_all(&mut self, files: &mut Files) {
        assert!(self.src.ts.is_empty());
        assert!(self.src.js.is_empty());
        self.print_intrinsics();
        assert!(self.src.ts.is_empty());
        files.push("intrinsics.js", self.src.js.as_bytes());
    }
}

struct FunctionBindgen<'a> {
    gen: &'a mut Js,
    tmp: usize,
    src: Source,
    block_storage: Vec<wit_bindgen_core::Source>,
    blocks: Vec<(String, Vec<String>)>,
    needs_memory: bool,
    needs_realloc: Option<String>,
    params: Vec<String>,
    src_object: String,
}

impl FunctionBindgen<'_> {
    fn new(gen: &mut Js, params: Vec<String>) -> FunctionBindgen<'_> {
        FunctionBindgen {
            gen,
            tmp: 0,
            src: Source::default(),
            block_storage: Vec::new(),
            blocks: Vec::new(),
            needs_memory: false,
            needs_realloc: None,
            params,
            src_object: "this".to_string(),
        }
    }

    fn tmp(&mut self) -> usize {
        let ret = self.tmp;
        self.tmp += 1;
        ret
    }

    fn clamp_guest<T>(&mut self, results: &mut Vec<String>, operands: &[String], min: T, max: T)
    where
        T: std::fmt::Display,
    {
        let clamp = self.gen.intrinsic(Intrinsic::ClampGuest);
        results.push(format!("{}({}, {}, {})", clamp, operands[0], min, max));
    }

    fn load(&mut self, method: &str, offset: i32, operands: &[String], results: &mut Vec<String>) {
        self.needs_memory = true;
        let view = self.gen.intrinsic(Intrinsic::DataView);
        results.push(format!(
            "{}(memory).{}({} + {}, true)",
            view, method, operands[0], offset,
        ));
    }

    fn store(&mut self, method: &str, offset: i32, operands: &[String]) {
        self.needs_memory = true;
        let view = self.gen.intrinsic(Intrinsic::DataView);
        self.src.js(&format!(
            "{}(memory).{}({} + {}, {}, true);\n",
            view, method, operands[1], offset, operands[0]
        ));
    }

    fn bind_results(&mut self, amt: usize, results: &mut Vec<String>) {
        match amt {
            0 => {}
            1 => {
                self.src.js("const ret = ");
                results.push("ret".to_string());
            }
            n => {
                self.src.js("const [");
                for i in 0..n {
                    if i > 0 {
                        self.src.js(", ");
                    }
                    self.src.js(&format!("ret{}", i));
                    results.push(format!("ret{}", i));
                }
                self.src.js("] = ");
            }
        }
    }
}

impl Bindgen for FunctionBindgen<'_> {
    type Operand = String;

    fn sizes(&self) -> &SizeAlign {
        &self.gen.sizes
    }

    fn push_block(&mut self) {
        let prev = mem::take(&mut self.src.js);
        self.block_storage.push(prev);
    }

    fn finish_block(&mut self, operands: &mut Vec<String>) {
        let to_restore = self.block_storage.pop().unwrap();
        let src = mem::replace(&mut self.src.js, to_restore);
        self.blocks.push((src.into(), mem::take(operands)));
    }

    fn return_pointer(&mut self, _iface: &Interface, _size: usize, _align: usize) -> String {
        unimplemented!()
    }

    fn is_list_canonical(&self, iface: &Interface, ty: &Type) -> bool {
        self.gen.array_ty(iface, ty).is_some()
    }

    fn emit(
        &mut self,
        iface: &Interface,
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
                        WasmType::I64 => results.push("0n".to_string()),
                        WasmType::I32 | WasmType::F32 | WasmType::F64 => {
                            results.push("0".to_string());
                        }
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
            Instruction::U32FromI32 => {
                results.push(format!("{} >>> 0", operands[0]));
            }
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
                let conv = self.gen.intrinsic(Intrinsic::ToUint8);
                results.push(format!("{conv}({op})", op = operands[0]))
            }
            Instruction::I32FromS8 => {
                let conv = self.gen.intrinsic(Intrinsic::ToInt8);
                results.push(format!("{conv}({op})", op = operands[0]))
            }
            Instruction::I32FromU16 => {
                let conv = self.gen.intrinsic(Intrinsic::ToUint16);
                results.push(format!("{conv}({op})", op = operands[0]))
            }
            Instruction::I32FromS16 => {
                let conv = self.gen.intrinsic(Intrinsic::ToInt16);
                results.push(format!("{conv}({op})", op = operands[0]))
            }
            Instruction::I32FromU32 => {
                let conv = self.gen.intrinsic(Intrinsic::ToUint32);
                results.push(format!("{conv}({op})", op = operands[0]))
            }
            Instruction::I32FromS32 => {
                let conv = self.gen.intrinsic(Intrinsic::ToInt32);
                results.push(format!("{conv}({op})", op = operands[0]))
            }
            Instruction::I64FromU64 => {
                let conv = self.gen.intrinsic(Intrinsic::ToBigUint64);
                results.push(format!("{conv}({op})", op = operands[0]))
            }
            Instruction::I64FromS64 => {
                let conv = self.gen.intrinsic(Intrinsic::ToBigInt64);
                results.push(format!("{conv}({op})", op = operands[0]))
            }

            // The native representation in JS of f32 and f64 is just a number,
            // so there's nothing to do here. Everything wasm gives us is
            // representable in JS.
            Instruction::Float32FromF32 | Instruction::Float64FromF64 => {
                results.push(operands.pop().unwrap())
            }

            Instruction::F32FromFloat32 | Instruction::F64FromFloat64 => {
                // Use a unary `+` to cast to a float.
                results.push(format!("+{}", operands[0]));
            }

            // Validate that i32 values coming from wasm are indeed valid code
            // points.
            Instruction::CharFromI32 => {
                let validate = self.gen.intrinsic(Intrinsic::ValidateGuestChar);
                results.push(format!("{}({})", validate, operands[0]));
            }

            // Validate that strings are indeed 1 character long and valid
            // unicode.
            Instruction::I32FromChar => {
                let validate = self.gen.intrinsic(Intrinsic::ValidateHostChar);
                results.push(format!("{}({})", validate, operands[0]));
            }

            Instruction::Bitcasts { casts } => {
                for (cast, op) in casts.iter().zip(operands) {
                    match cast {
                        Bitcast::I32ToF32 => {
                            let cvt = self.gen.intrinsic(Intrinsic::I32ToF32);
                            results.push(format!("{}({})", cvt, op));
                        }
                        Bitcast::F32ToI32 => {
                            let cvt = self.gen.intrinsic(Intrinsic::F32ToI32);
                            results.push(format!("{}({})", cvt, op));
                        }
                        Bitcast::I64ToF64 => {
                            let cvt = self.gen.intrinsic(Intrinsic::I64ToF64);
                            results.push(format!("{}({})", cvt, op));
                        }
                        Bitcast::F64ToI64 => {
                            let cvt = self.gen.intrinsic(Intrinsic::F64ToI64);
                            results.push(format!("{}({})", cvt, op));
                        }
                        Bitcast::I32ToI64 => results.push(format!("BigInt({})", op)),
                        Bitcast::I64ToI32 => results.push(format!("Number({})", op)),
                        Bitcast::I64ToF32 => {
                            let cvt = self.gen.intrinsic(Intrinsic::I32ToF32);
                            results.push(format!("{}(Number({}))", cvt, op));
                        }
                        Bitcast::F32ToI64 => {
                            let cvt = self.gen.intrinsic(Intrinsic::F32ToI32);
                            results.push(format!("BigInt({}({}))", cvt, op));
                        }
                        Bitcast::None => results.push(op.clone()),
                    }
                }
            }

            Instruction::BoolFromI32 => {
                let tmp = self.tmp();
                self.src
                    .js(&format!("const bool{} = {};\n", tmp, operands[0]));
                let throw = self.gen.intrinsic(Intrinsic::ThrowInvalidBool);
                results.push(format!(
                    "bool{tmp} == 0 ? false : (bool{tmp} == 1 ? true : {throw}())"
                ));
            }
            Instruction::I32FromBool => {
                results.push(format!("{} ? 1 : 0", operands[0]));
            }

            Instruction::RecordLower { record, .. } => {
                // use destructuring field access to get each
                // field individually.
                let tmp = self.tmp();
                let mut expr = "const {".to_string();
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
                self.src.js(&format!("{} }} = {};\n", expr, operands[0]));
            }

            Instruction::RecordLift { record, .. } => {
                // records are represented as plain objects, so we
                // make a new object and set all the fields with an object
                // literal.
                let mut result = "{\n".to_string();
                for (field, op) in record.fields.iter().zip(operands) {
                    result.push_str(&format!("{}: {},\n", field.name.to_lower_camel_case(), op));
                }
                result.push_str("}");
                results.push(result);
            }

            Instruction::TupleLower { tuple, .. } => {
                // Tuples are represented as an array, sowe can use
                // destructuring assignment to lower the tuple into its
                // components.
                let tmp = self.tmp();
                let mut expr = "const [".to_string();
                for i in 0..tuple.types.len() {
                    if i > 0 {
                        expr.push_str(", ");
                    }
                    let name = format!("tuple{}_{}", tmp, i);
                    expr.push_str(&name);
                    results.push(name);
                }
                self.src.js(&format!("{}] = {};\n", expr, operands[0]));
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
                    self.src.js(&format!("let {name} = 0;\n"));
                    results.push(name);
                }

                self.src.js(&format!(
                    "if (typeof {op0} === \"object\" && {op0} !== null) {{\n"
                ));

                for (i, chunk) in flags.flags.chunks(32).enumerate() {
                    let result_name = &results[i];

                    self.src.js(&format!("{result_name} = "));
                    for (i, flag) in chunk.iter().enumerate() {
                        if i != 0 {
                            self.src.js(" | ");
                        }

                        let flag = flag.name.to_lower_camel_case();
                        self.src.js(&format!("Boolean({op0}.{flag}) << {i}"));
                    }
                    self.src.js(";\n");
                }

                self.src.js(&format!("\
                    }} else if ({op0} !== null && {op0} !== undefined) {{
                        throw new TypeError(\"only an object, undefined or null can be converted to flags\");
                    }}
                "));

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
                    if flags.flags.len() % 32 != 0 {
                        let mask: u32 = 0xffffffff << (flags.flags.len() % 32);
                        self.src.js(&format!(
                            "\
                            if (({op} & {mask}) !== 0) {{
                                throw new TypeError('flags have extraneous bits set');
                            }}
                            "
                        ));
                    }
                }

                self.src.js(&format!("const flags{tmp} = {{\n"));

                for (i, flag) in flags.flags.iter().enumerate() {
                    let flag = flag.name.to_lower_camel_case();
                    let op = &operands[i / 32];
                    let mask: u32 = 1 << (i % 32);
                    self.src.js(&format!("{flag}: Boolean({op} & {mask}),\n"));
                }

                self.src.js("};\n");
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
                self.src
                    .js(&format!("const variant{} = {};\n", tmp, operands[0]));

                for i in 0..result_types.len() {
                    self.src.js(&format!("let variant{}_{};\n", tmp, i));
                    results.push(format!("variant{}_{}", tmp, i));
                }

                let expr_to_match = format!("variant{}.tag", tmp);

                self.src.js(&format!("switch ({}) {{\n", expr_to_match));
                for (case, (block, block_results)) in variant.cases.iter().zip(blocks) {
                    self.src
                        .js(&format!("case \"{}\": {{\n", case.name.as_str()));
                    if case.ty.is_some() {
                        self.src.js(&format!("const e = variant{}.val;\n", tmp));
                    }
                    self.src.js(&block);

                    for (i, result) in block_results.iter().enumerate() {
                        self.src
                            .js(&format!("variant{}_{} = {};\n", tmp, i, result));
                    }
                    self.src.js("break;\n}\n");
                }
                let variant_name = name.to_upper_camel_case();
                self.src.js("default:\n");
                self.src.js(&format!(
                    "throw new RangeError(\"invalid variant specified for {}\");\n",
                    variant_name
                ));
                self.src.js("}\n");
            }

            Instruction::VariantLift { variant, name, .. } => {
                let blocks = self
                    .blocks
                    .drain(self.blocks.len() - variant.cases.len()..)
                    .collect::<Vec<_>>();

                let tmp = self.tmp();

                self.src.js(&format!("let variant{};\n", tmp));
                self.src.js(&format!("switch ({}) {{\n", operands[0]));
                for (i, (case, (block, block_results))) in
                    variant.cases.iter().zip(blocks).enumerate()
                {
                    self.src.js(&format!("case {}: {{\n", i));
                    self.src.js(&block);

                    self.src.js(&format!("variant{} = {{\n", tmp));
                    self.src.js(&format!("tag: \"{}\",\n", case.name.as_str()));
                    if case.ty.is_some() {
                        assert!(block_results.len() == 1);
                        self.src.js(&format!("val: {},\n", block_results[0]));
                    } else {
                        assert!(block_results.len() == 0);
                    }
                    self.src.js("};\n");
                    self.src.js("break;\n}\n");
                }
                let variant_name = name.to_upper_camel_case();
                self.src.js("default:\n");
                self.src.js(&format!(
                    "throw new RangeError(\"invalid variant discriminant for {}\");\n",
                    variant_name
                ));
                self.src.js("}\n");
                results.push(format!("variant{}", tmp));
            }

            Instruction::UnionLower {
                union,
                results: result_types,
                name,
                ..
            } => {
                let blocks = self
                    .blocks
                    .drain(self.blocks.len() - union.cases.len()..)
                    .collect::<Vec<_>>();
                let tmp = self.tmp();
                let op0 = &operands[0];
                self.src.js(&format!("const union{tmp} = {op0};\n"));

                for i in 0..result_types.len() {
                    self.src.js(&format!("let union{tmp}_{i};\n"));
                    results.push(format!("union{tmp}_{i}"));
                }

                self.src.js(&format!("switch (union{tmp}.tag) {{\n"));
                for (i, (_case, (block, block_results))) in
                    union.cases.iter().zip(blocks).enumerate()
                {
                    self.src.js(&format!("case {i}: {{\n"));
                    self.src.js(&format!("const e = union{tmp}.val;\n"));
                    self.src.js(&block);
                    for (i, result) in block_results.iter().enumerate() {
                        self.src.js(&format!("union{tmp}_{i} = {result};\n"));
                    }
                    self.src.js("break;\n}\n");
                }
                let name = name.to_upper_camel_case();
                self.src.js("default:\n");
                self.src.js(&format!(
                    "throw new RangeError(\"invalid union specified for {name}\");\n",
                ));
                self.src.js("}\n");
            }

            Instruction::UnionLift { union, name, .. } => {
                let blocks = self
                    .blocks
                    .drain(self.blocks.len() - union.cases.len()..)
                    .collect::<Vec<_>>();

                let tmp = self.tmp();

                self.src.js(&format!("let union{tmp};\n"));
                self.src.js(&format!("switch ({}) {{\n", operands[0]));
                for (i, (_case, (block, block_results))) in
                    union.cases.iter().zip(blocks).enumerate()
                {
                    assert!(block_results.len() == 1);
                    let block_result = &block_results[0];
                    self.src.js(&format!(
                        "case {i}: {{
                            {block}
                            union{tmp} = {{
                                tag: {i},
                                val: {block_result},
                            }};
                            break;
                        }}\n"
                    ));
                }
                let name = name.to_upper_camel_case();
                self.src.js("default:\n");
                self.src.js(&format!(
                    "throw new RangeError(\"invalid union discriminant for {name}\");\n",
                ));
                self.src.js("}\n");
                results.push(format!("union{tmp}"));
            }

            Instruction::OptionLower {
                payload,
                results: result_types,
                ..
            } => {
                let (mut some, some_results) = self.blocks.pop().unwrap();
                let (mut none, none_results) = self.blocks.pop().unwrap();

                let tmp = self.tmp();
                self.src
                    .js(&format!("const variant{tmp} = {};\n", operands[0]));

                for i in 0..result_types.len() {
                    self.src.js(&format!("let variant{tmp}_{i};\n"));
                    results.push(format!("variant{tmp}_{i}"));

                    let some_result = &some_results[i];
                    let none_result = &none_results[i];
                    some.push_str(&format!("variant{tmp}_{i} = {some_result};\n"));
                    none.push_str(&format!("variant{tmp}_{i} = {none_result};\n"));
                }

                if self.gen.maybe_null(iface, payload) {
                    self.src.js(&format!(
                        "
                        switch (variant{tmp}.tag) {{
                            case \"none\": {{
                                {none}
                                break;
                            }}
                            case \"some\": {{
                                const e = variant{tmp}.val;
                                {some}
                                break;
                            }}
                            default: {{
                                throw new RangeError(\"invalid variant specified for option\");
                            }}
                        }}
                        "
                    ));
                } else {
                    self.src.js(&format!(
                        "
                        switch (variant{tmp}) {{
                            case null: {{
                                {none}
                                break;
                            }}
                            default: {{
                                const e = variant{tmp};
                                {some}
                                break;
                            }}
                        }}
                        "
                    ));
                }
            }

            Instruction::OptionLift { payload, .. } => {
                let (some, some_results) = self.blocks.pop().unwrap();
                let (none, none_results) = self.blocks.pop().unwrap();
                assert!(none_results.len() == 0);
                assert!(some_results.len() == 1);
                let some_result = &some_results[0];

                let tmp = self.tmp();

                self.src.js(&format!("let variant{tmp};\n"));
                self.src.js(&format!("switch ({}) {{\n", operands[0]));

                if self.gen.maybe_null(iface, payload) {
                    self.src.js(&format!(
                        "
                            case 0: {{
                                {none}
                                variant{tmp} = {{ tag: \"none\" }};
                                break;
                            }}
                            case 1: {{
                                {some}
                                variant{tmp} = {{ tag: \"some\", val: {some_result} }};
                                break;
                            }}
                        ",
                    ));
                } else {
                    self.src.js(&format!(
                        "
                            case 0: {{
                                {none}
                                variant{tmp} = null;
                                break;
                            }}
                            case 1: {{
                                {some}
                                variant{tmp} = {some_result};
                                break;
                            }}
                        ",
                    ));
                }
                self.src.js("
                    default:
                        throw new RangeError(\"invalid variant discriminant for option\");
                ");
                self.src.js("}\n");
                results.push(format!("variant{tmp}"));
            }

            Instruction::ResultLower {
                results: result_types,
                ..
            } => {
                let (mut err, err_results) = self.blocks.pop().unwrap();
                let (mut ok, ok_results) = self.blocks.pop().unwrap();

                let tmp = self.tmp();
                self.src
                    .js(&format!("const variant{tmp} = {};\n", operands[0]));

                for i in 0..result_types.len() {
                    self.src.js(&format!("let variant{tmp}_{i};\n"));
                    results.push(format!("variant{tmp}_{i}"));

                    let ok_result = &ok_results[i];
                    let err_result = &err_results[i];
                    ok.push_str(&format!("variant{tmp}_{i} = {ok_result};\n"));
                    err.push_str(&format!("variant{tmp}_{i} = {err_result};\n"));
                }

                self.src.js(&format!(
                    "
                    switch (variant{tmp}.tag) {{
                        case \"ok\": {{
                            const e = variant{tmp}.val;
                            {ok}
                            break;
                        }}
                        case \"err\": {{
                            const e = variant{tmp}.val;
                            {err}
                            break;
                        }}
                        default: {{
                            throw new RangeError(\"invalid variant specified for result\");
                        }}
                    }}
                    "
                ));
            }

            Instruction::ResultLift { result, .. } => {
                let (err, err_results) = self.blocks.pop().unwrap();
                let (ok, ok_results) = self.blocks.pop().unwrap();
                let ok_result = if result.ok.is_some() {
                    assert_eq!(ok_results.len(), 1);
                    format!("{}", ok_results[0])
                } else {
                    assert_eq!(ok_results.len(), 0);
                    String::from("undefined")
                };
                let err_result = if result.err.is_some() {
                    assert_eq!(err_results.len(), 1);
                    format!("{}", err_results[0])
                } else {
                    assert_eq!(err_results.len(), 0);
                    String::from("undefined")
                };
                let tmp = self.tmp();
                let op0 = &operands[0];
                self.src.js(&format!(
                    "
                    let variant{tmp};
                    switch ({op0}) {{
                        case 0: {{
                            {ok}
                            variant{tmp} = {{ tag: \"ok\", val: {ok_result} }};
                            break;
                        }}
                        case 1: {{
                            {err}
                            variant{tmp} = {{ tag: \"err\", val: {err_result} }};
                            break;
                        }}
                        default: {{
                            throw new RangeError(\"invalid variant discriminant for expected\");
                        }}
                    }}
                    ",
                ));
                results.push(format!("variant{tmp}"));
            }

            // Lowers an enum in accordance with https://webidl.spec.whatwg.org/#es-enumeration.
            Instruction::EnumLower { name, enum_, .. } => {
                let tmp = self.tmp();

                let to_string = self.gen.intrinsic(Intrinsic::ToString);
                self.src
                    .js(&format!("const val{tmp} = {to_string}({});\n", operands[0]));

                // Declare a variable to hold the result.
                self.src.js(&format!("let enum{tmp};\n"));

                self.src.js(&format!("switch (val{tmp}) {{\n"));
                for (i, case) in enum_.cases.iter().enumerate() {
                    self.src.js(&format!(
                        "\
                        case \"{case}\": {{
                            enum{tmp} = {i};
                            break;
                        }}
                        ",
                        case = case.name
                    ));
                }
                self.src.js(&format!("\
                        default: {{
                            throw new TypeError(`\"${{val{tmp}}}\" is not one of the cases of {name}`);
                        }}
                    }}
                "));

                results.push(format!("enum{tmp}"));
            }

            Instruction::EnumLift { name, enum_, .. } => {
                let tmp = self.tmp();

                self.src.js(&format!("let enum{tmp};\n"));

                self.src.js(&format!("switch ({}) {{\n", operands[0]));
                for (i, case) in enum_.cases.iter().enumerate() {
                    self.src.js(&format!(
                        "\
                        case {i}: {{
                            enum{tmp} = \"{case}\";
                            break;
                        }}
                        ",
                        case = case.name
                    ));
                }
                self.src.js(&format!(
                    "\
                        default: {{
                            throw new RangeError(\"invalid discriminant specified for {name}\");
                        }}
                    }}
                    ",
                    name = name.to_upper_camel_case()
                ));

                results.push(format!("enum{tmp}"));
            }

            Instruction::ListCanonLower { element, realloc } => {
                // Lowering only happens when we're passing lists into wasm,
                // which forces us to always allocate, so this should always be
                // `Some`.
                let realloc = realloc.unwrap();
                self.gen.needs_get_export = true;
                self.needs_memory = true;
                self.needs_realloc = Some(realloc.to_string());
                let tmp = self.tmp();

                let size = self.gen.sizes.size(element);
                let align = self.gen.sizes.align(element);
                self.src
                    .js(&format!("const val{} = {};\n", tmp, operands[0]));
                self.src.js(&format!("const len{} = val{0}.length;\n", tmp));
                self.src.js(&format!(
                    "const ptr{} = realloc(0, 0, {}, len{0} * {});\n",
                    tmp, align, size,
                ));
                // TODO: this is the wrong endianness
                self.src.js(&format!(
                    "(new Uint8Array(memory.buffer, ptr{0}, len{0} * {1})).set(new Uint8Array(val{0}.buffer, val{0}.byteOffset, len{0} * {1}));\n",
                    tmp, size,
                ));
                results.push(format!("ptr{}", tmp));
                results.push(format!("len{}", tmp));
            }
            Instruction::ListCanonLift { element, .. } => {
                self.needs_memory = true;
                let tmp = self.tmp();
                self.src.js(&format!("const ptr{tmp} = {};\n", operands[0]));
                self.src.js(&format!("const len{tmp} = {};\n", operands[1]));
                // TODO: this is the wrong endianness
                let array_ty = self.gen.array_ty(iface, element).unwrap();
                self.src.js(&format!(
                    "const result{tmp} = new {array_ty}(memory.buffer.slice(ptr{tmp}, ptr{tmp} + len{tmp} * {}));\n",
                    self.gen.sizes.size(element),
                ));
                results.push(format!("result{tmp}"));
            }
            Instruction::StringLower { realloc } => {
                // Lowering only happens when we're passing strings into wasm,
                // which forces us to always allocate, so this should always be
                // `Some`.
                let realloc = realloc.unwrap();
                self.gen.needs_get_export = true;
                self.needs_memory = true;
                self.needs_realloc = Some(realloc.to_string());
                let tmp = self.tmp();

                let encode = self.gen.intrinsic(Intrinsic::Utf8Encode);
                self.src.js(&format!(
                    "const ptr{} = {}({}, realloc, memory);\n",
                    tmp, encode, operands[0],
                ));
                let encoded_len = self.gen.intrinsic(Intrinsic::Utf8EncodedLen);
                self.src
                    .js(&format!("const len{} = {};\n", tmp, encoded_len));
                results.push(format!("ptr{}", tmp));
                results.push(format!("len{}", tmp));
            }
            Instruction::StringLift => {
                self.needs_memory = true;
                let tmp = self.tmp();
                self.src.js(&format!("const ptr{tmp} = {};\n", operands[0]));
                self.src.js(&format!("const len{tmp} = {};\n", operands[1]));
                let decoder = self.gen.intrinsic(Intrinsic::Utf8Decoder);
                self.src.js(&format!(
                    "const result{tmp} = {decoder}.decode(new Uint8Array(memory.buffer, ptr{tmp}, len{tmp}));\n",
                ));
                results.push(format!("result{tmp}"));
            }

            Instruction::ListLower { element, realloc } => {
                let realloc = realloc.unwrap();
                let (body, body_results) = self.blocks.pop().unwrap();
                assert!(body_results.is_empty());
                let tmp = self.tmp();
                let vec = format!("vec{}", tmp);
                let result = format!("result{}", tmp);
                let len = format!("len{}", tmp);
                self.needs_realloc = Some(realloc.to_string());
                let size = self.gen.sizes.size(element);
                let align = self.gen.sizes.align(element);

                // first store our vec-to-lower in a temporary since we'll
                // reference it multiple times.
                self.src.js(&format!("const {} = {};\n", vec, operands[0]));
                self.src.js(&format!("const {} = {}.length;\n", len, vec));

                // ... then realloc space for the result in the guest module
                self.src.js(&format!(
                    "const {} = realloc(0, 0, {}, {} * {});\n",
                    result, align, len, size,
                ));

                // ... then consume the vector and use the block to lower the
                // result.
                self.src
                    .js(&format!("for (let i = 0; i < {}.length; i++) {{\n", vec));
                self.src.js(&format!("const e = {}[i];\n", vec));
                self.src
                    .js(&format!("const base = {} + i * {};\n", result, size));
                self.src.js(&body);
                self.src.js("}\n");

                results.push(result);
                results.push(len);
            }

            Instruction::ListLift { element, .. } => {
                let (body, body_results) = self.blocks.pop().unwrap();
                let tmp = self.tmp();
                let size = self.gen.sizes.size(element);
                let len = format!("len{}", tmp);
                self.src.js(&format!("const {} = {};\n", len, operands[1]));
                let base = format!("base{}", tmp);
                self.src.js(&format!("const {} = {};\n", base, operands[0]));
                let result = format!("result{}", tmp);
                self.src.js(&format!("const {} = [];\n", result));
                results.push(result.clone());

                self.src
                    .js(&format!("for (let i = 0; i < {}; i++) {{\n", len));
                self.src
                    .js(&format!("const base = {} + i * {};\n", base, size));
                self.src.js(&body);
                assert_eq!(body_results.len(), 1);
                self.src
                    .js(&format!("{}.push({});\n", result, body_results[0]));
                self.src.js("}\n");
            }

            Instruction::IterElem { .. } => results.push("e".to_string()),

            Instruction::IterBasePointer => results.push("base".to_string()),

            Instruction::CallWasm {
                iface: _,
                name,
                sig,
            } => {
                self.bind_results(sig.results.len(), results);
                self.src.js(&self.src_object);
                self.src.js("._exports['");
                self.src.js(&name);
                self.src.js("'](");
                self.src.js(&operands.join(", "));
                self.src.js(");\n");
            }

            Instruction::CallInterface { module: _, func } => {
                let call = |me: &mut FunctionBindgen<'_>| match &func.kind {
                    FunctionKind::Freestanding => {
                        me.src.js(&format!(
                            "obj.{}({})",
                            func.name.to_lower_camel_case(),
                            operands.join(", "),
                        ));
                    }
                };
                let mut bind_results = |me: &mut FunctionBindgen<'_>| {
                    let amt = func.results.len();
                    if amt == 0 {
                        return;
                    }
                    me.src.js("const ");
                    if amt > 1 {
                        me.src.js("[");
                    }
                    for i in 0..amt {
                        if i > 0 {
                            me.src.js(", ");
                        }
                        let name = format!("ret{i}");
                        me.src.js(&name);
                        results.push(name);
                    }
                    if amt > 1 {
                        me.src.js("]");
                    }
                    me.src.js(" = ");
                };

                bind_results(self);
                call(self);
                self.src.js(";\n");
            }

            Instruction::Return { amt, func } => {
                if !self.gen.in_import && iface.guest_export_needs_post_return(func) {
                    let name = &func.name;
                    self.src.js(&format!(
                        "{}._exports[\"cabi_post_{name}\"](ret);\n",
                        self.src_object
                    ));
                }

                match amt {
                    0 => {}
                    1 => self.src.js(&format!("return {};\n", operands[0])),
                    _ => self.src.js(&format!("return [{}];\n", operands.join(", "))),
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

            Instruction::Malloc {
                realloc,
                size,
                align,
            } => {
                self.needs_realloc = Some(realloc.to_string());
                let tmp = self.tmp();
                let ptr = format!("ptr{}", tmp);
                self.src.js(&format!(
                    "const {} = realloc(0, 0, {}, {});\n",
                    ptr, align, size
                ));
                results.push(ptr);
            }

            i => unimplemented!("{:?}", i),
        }
    }
}

impl Js {
    fn print_intrinsics(&mut self) {
        if self.all_intrinsics.contains(&Intrinsic::I32ToF32)
            || self.all_intrinsics.contains(&Intrinsic::F32ToI32)
        {
            self.src.js("
                const I32_TO_F32_I = new Int32Array(1);
                const I32_TO_F32_F = new Float32Array(I32_TO_F32_I.buffer);
            ");
        }
        if self.all_intrinsics.contains(&Intrinsic::I64ToF64)
            || self.all_intrinsics.contains(&Intrinsic::F64ToI64)
        {
            self.src.js("
                const I64_TO_F64_I = new BigInt64Array(1);
                const I64_TO_F64_F = new Float64Array(I64_TO_F64_I.buffer);
            ");
        }

        if self.all_intrinsics.contains(&Intrinsic::Promises) {
            self.all_intrinsics.insert(Intrinsic::Slab);
        }

        for i in mem::take(&mut self.all_intrinsics) {
            self.print_intrinsic(i);
        }
    }

    fn print_intrinsic(&mut self, i: Intrinsic) {
        match i {
            Intrinsic::ClampGuest => self.src.js("
                export function clamp_guest(i, min, max) {
                    if (i < min || i > max) \
                        throw new RangeError(`must be between ${min} and ${max}`);
                    return i;
                }
            "),

            Intrinsic::DataView => self.src.js("
                let DATA_VIEW = new DataView(new ArrayBuffer());

                export function data_view(mem) {
                    if (DATA_VIEW.buffer !== mem.buffer) \
                        DATA_VIEW = new DataView(mem.buffer);
                    return DATA_VIEW;
                }
            "),

            Intrinsic::ValidateGuestChar => self.src.js("
                export function validate_guest_char(i) {
                    if ((i > 0x10ffff) || (i >= 0xd800 && i <= 0xdfff)) \
                        throw new RangeError(`not a valid char`);
                    return String.fromCodePoint(i);
                }
            "),

            // TODO: this is incorrect. It at least allows strings of length > 0
            // but it probably doesn't do the right thing for unicode or invalid
            // utf16 strings either.
            Intrinsic::ValidateHostChar => self.src.js("
                export function validate_host_char(s) {
                    if (typeof s !== 'string') \
                        throw new TypeError(`must be a string`);
                    return s.codePointAt(0);
                }
            "),


            Intrinsic::ToInt32 => self.src.js("
                export function to_int32(val) {
                    return val >> 0;
                }
            "),
            Intrinsic::ToUint32 => self.src.js("
                export function to_uint32(val) {
                    return val >>> 0;
                }
            "),

            Intrinsic::ToInt16 => self.src.js("
                export function to_int16(val) {
                    val >>>= 0;
                    val %= 2 ** 16;
                    if (val >= 2 ** 15) {
                        val -= 2 ** 16;
                    }
                    return val;
                }
            "),
            Intrinsic::ToUint16 => self.src.js("
                export function to_uint16(val) {
                    val >>>= 0;
                    val %= 2 ** 16;
                    return val;
                }
            "),
            Intrinsic::ToInt8 => self.src.js("
                export function to_int8(val) {
                    val >>>= 0;
                    val %= 2 ** 8;
                    if (val >= 2 ** 7) {
                        val -= 2 ** 8;
                    }
                    return val;
                }
            "),
            Intrinsic::ToUint8 => self.src.js("
                export function to_uint8(val) {
                    val >>>= 0;
                    val %= 2 ** 8;
                    return val;
                }
            "),

            Intrinsic::ToBigInt64 => self.src.js("
                export function to_int64(val) {
                    return BigInt.asIntN(64, val);
                }
            "),
            Intrinsic::ToBigUint64 => self.src.js("
                export function to_uint64(val) {
                    return BigInt.asUintN(64, val);
                }
            "),

            Intrinsic::ToString => self.src.js("
                export function to_string(val) {
                    if (typeof val === 'symbol') {
                        throw new TypeError('symbols cannot be converted to strings');
                    } else {
                        // Calling `String` almost directly calls `ToString`, except that it also allows symbols,
                        // which is why we have the symbol-rejecting branch above.
                        //
                        // Definition of `String`: https://tc39.es/ecma262/#sec-string-constructor-string-value
                        return String(val);
                    }
                }
            "),

            Intrinsic::I32ToF32 => self.src.js("
                export function i32ToF32(i) {
                    I32_TO_F32_I[0] = i;
                    return I32_TO_F32_F[0];
                }
            "),
            Intrinsic::F32ToI32 => self.src.js("
                export function f32ToI32(f) {
                    I32_TO_F32_F[0] = f;
                    return I32_TO_F32_I[0];
                }
            "),
            Intrinsic::I64ToF64 => self.src.js("
                export function i64ToF64(i) {
                    I64_TO_F64_I[0] = i;
                    return I64_TO_F64_F[0];
                }
            "),
            Intrinsic::F64ToI64 => self.src.js("
                export function f64ToI64(f) {
                    I64_TO_F64_F[0] = f;
                    return I64_TO_F64_I[0];
                }
            "),

            Intrinsic::Utf8Decoder => self
                .src
                .js("export const UTF8_DECODER = new TextDecoder('utf-8');\n"),

            Intrinsic::Utf8EncodedLen => self.src.js("export let UTF8_ENCODED_LEN = 0;\n"),

            Intrinsic::Utf8Encode => self.src.js("
                const UTF8_ENCODER = new TextEncoder('utf-8');

                export function utf8_encode(s, realloc, memory) {
                    if (typeof s !== 'string') \
                        throw new TypeError('expected a string');

                    if (s.length === 0) {
                        UTF8_ENCODED_LEN = 0;
                        return 1;
                    }

                    let alloc_len = 0;
                    let ptr = 0;
                    let writtenTotal = 0;
                    while (s.length > 0) {
                        ptr = realloc(ptr, alloc_len, 1, alloc_len + s.length);
                        alloc_len += s.length;
                        const { read, written } = UTF8_ENCODER.encodeInto(
                            s,
                            new Uint8Array(memory.buffer, ptr + writtenTotal, alloc_len - writtenTotal),
                        );
                        writtenTotal += written;
                        s = s.slice(read);
                    }
                    if (alloc_len > writtenTotal)
                        ptr = realloc(ptr, alloc_len, 1, writtenTotal);
                    UTF8_ENCODED_LEN = writtenTotal;
                    return ptr;
                }
            "),

            Intrinsic::Slab => self.src.js("
                export class Slab {
                    constructor() {
                        this.list = [];
                        this.head = 0;
                    }

                    insert(val) {
                        if (this.head >= this.list.length) {
                            this.list.push({
                                next: this.list.length + 1,
                                val: undefined,
                            });
                        }
                        const ret = this.head;
                        const slot = this.list[ret];
                        this.head = slot.next;
                        slot.next = -1;
                        slot.val = val;
                        return ret;
                    }

                    get(idx) {
                        if (idx >= this.list.length)
                            throw new RangeError('handle index not valid');
                        const slot = this.list[idx];
                        if (slot.next === -1)
                            return slot.val;
                        throw new RangeError('handle index not valid');
                    }

                    remove(idx) {
                        const ret = this.get(idx); // validate the slot
                        const slot = this.list[idx];
                        slot.val = undefined;
                        slot.next = this.head;
                        this.head = idx;
                        return ret;
                    }
                }
            "),

            Intrinsic::Promises => self.src.js("export const PROMISES = new Slab();\n"),
            Intrinsic::ThrowInvalidBool => self.src.js("
                export function throw_invalid_bool() {
                    throw new RangeError(\"invalid variant discriminant for bool\");
                }
            "),
        }
    }
}

pub fn to_js_ident(name: &str) -> &str {
    match name {
        "in" => "in_",
        "import" => "import_",
        s => s,
    }
}

#[derive(Default)]
struct Source {
    js: wit_bindgen_core::Source,
    ts: wit_bindgen_core::Source,
}

impl Source {
    fn js(&mut self, s: &str) {
        self.js.push_str(s);
    }
    fn ts(&mut self, s: &str) {
        self.ts.push_str(s);
    }
}
