use crate::files::Files;
use crate::source;
use crate::{uwrite, uwriteln};
use crate::function_bindgen::{FunctionBindgen, ErrHandling};
use crate::intrinsics::{Intrinsic};
use anyhow::Result;
use heck::*;
use indexmap::IndexMap;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fmt::Write;
use std::mem;
use wasmtime_environ::component::{
    CanonicalOptions, Component, CoreDef, CoreExport, Export, ExportItem, GlobalInitializer,
    InstantiateModule, LowerImport, RuntimeInstanceIndex, StaticModuleIndex,
};
use wasmtime_environ::{EntityIndex, ModuleTranslation, PrimaryMap};
use wit_parser::abi::{AbiVariant, LiftLower};
use wit_parser::*;
use base64::{Engine as _, engine::general_purpose};

#[derive(Default)]
pub struct GenerationOpts {
    pub name: String,
    /// Disables generation of `*.d.ts` files and instead only generates `*.js`
    /// source files.
    pub no_typescript: bool,
    /// Provide a custom JS instantiation API for the component instead
    /// of the direct importable native ESM output.
    pub instantiation: bool,
    /// Comma-separated list of "from-specifier=./to-specifier.js" mappings of
    /// component import specifiers to JS import specifiers.
    pub map: Option<HashMap<String, String>>,
    /// Enables all compat flags: --tla-compat.
    pub compat: bool,
    /// Disables compatibility in Node.js without a fetch global.
    pub no_nodejs_compat: bool,
    /// Set the cutoff byte size for base64 inlining core Wasm in instantiation mode
    /// (set to 0 to disable all base64 inlining)
    pub base64_cutoff: usize,
    /// Enables compatibility for JS environments without top-level await support
    /// via an async $init promise export to wait for instead.
    pub tla_compat: bool,
    /// Disable verification of component Wasm data structures when
    /// lifting as a production optimization
    pub valid_lifting_optimization: bool,
    /// Provide raw function and interface bindgen only, without
    /// handling initialization, imports or exports
    #[cfg(feature = "raw-bindgen")]
    pub raw_bindgen: bool,
}

impl GenerationOpts {
    pub fn build(self) -> Result<JsBindgen> {
        let mut gen = JsBindgen::default();
        gen.opts = self;
        if gen.opts.compat {
            gen.opts.tla_compat = true;
        }
        if gen.opts.raw_bindgen {
            gen.opts.no_typescript = true;
            gen.opts.tla_compat = false;
        }
        Ok(gen)
    }
}

#[derive(Default)]
pub struct JsBindgen {
    /// The source code for the "main" file that's going to be created for the
    /// component we're generating bindings for. This is incrementally added to
    /// over time and primarily contains the main `instantiate` function as well
    /// as a type-description of the input/output interfaces.
    src: Source,

    /// JS output imports map from imported specifier, to a list of bindings
    imports: HashMap<String, Vec<(String, String)>>,

    /// Type script definitions which will become the import object
    import_object: source::Source,
    /// Type script definitions which will become the export object
    export_object: source::Source,

    /// Core module count
    core_module_cnt: usize,

    /// Various options for code generation.
    pub opts: GenerationOpts,

    /// List of all intrinsics emitted to `src` so far.
    all_intrinsics: BTreeSet<Intrinsic>,
}

/// Used to generate a `*.d.ts` file for each imported and exported interface for
/// a component.
///
/// This generated source does not contain any actual JS runtime code, it's just
/// typescript definitions.
struct JsInterface<'a> {
    src: Source,
    gen: &'a mut JsBindgen,
    resolve: &'a Resolve,
    needs_ty_option: bool,
    needs_ty_result: bool,
}

impl JsBindgen {
    pub fn instantiate(
        &mut self,
        component: &Component,
        modules: &PrimaryMap<StaticModuleIndex, ModuleTranslation<'_>>,
        resolve: &Resolve,
        id: WorldId,
    ) {
        self.core_module_cnt = modules.len();
        let world = &resolve.worlds[id];

        // Generate the TypeScript definition of the `instantiate` function
        // which is the main workhorse of the generated bindings.
        if self.opts.instantiation {
            let camel = world.name.to_upper_camel_case();
            uwriteln!(
                self.src.ts,
                "
                /**
                    * Instantiates this component with the provided imports and
                    * returns a map of all the exports of the component.
                    *
                    * This function is intended to be similar to the
                    * `WebAssembly.instantiate` function. The second `imports`
                    * argument is the \"import object\" for wasm, except here it
                    * uses component-model-layer types instead of core wasm
                    * integers/numbers/etc.
                    *
                    * The first argument to this function, `compileCore`, is
                    * used to compile core wasm modules within the component.
                    * Components are composed of core wasm modules and this callback
                    * will be invoked per core wasm module. The caller of this
                    * function is responsible for reading the core wasm module
                    * identified by `path` and returning its compiled
                    * WebAssembly.Module object. This would use `compileStreaming`
                    * on the web, for example.
                    */
                    export function instantiate(
                        compileCore: (path: string, imports: Record<string, any>) => Promise<WebAssembly.Module>,
                        imports: ImportObject,
                        instantiateCore?: (module: WebAssembly.Module, imports: Record<string, any>) => Promise<WebAssembly.Instance>
                    ): Promise<{camel}>;
                ",
            );
        }

        // bindings is the actual `instantiate` method itself, created by this
        // structure.
        let mut instantiator = Instantiator {
            src: Source::default(),
            sizes: SizeAlign::default(),
            gen: self,
            modules,
            instances: Default::default(),
            resolve,
            world: id,
            component,
        };
        instantiator.sizes.fill(resolve);
        instantiator.instantiate();
        instantiator.gen.src.js(&instantiator.src.js);
        instantiator.gen.src.js_init(&instantiator.src.js_init);
        assert!(instantiator.src.ts.is_empty());
    }

    pub fn core_file_name(&mut self, name: &str, idx: u32) -> String {
        let i_str = if idx == 0 {
            String::from("")
        } else {
            (idx + 1).to_string()
        };
        format!("{}.core{i_str}.wasm", name)
    }

    pub fn finish_component(&mut self, name: &str, files: &mut Files) {
        let mut output = source::Source::default();
        let mut compilation_promises = source::Source::default();

        // Setup the compilation data and compilation promises
        let mut removed = BTreeSet::new();
        for i in 0..self.core_module_cnt {
            let local_name = format!("module{}", i);
            let mut name_idx = self.core_file_name(name, i as u32);
            if self.opts.instantiation {
                uwriteln!(
                    compilation_promises,
                    "const {local_name} = compileCore('{name_idx}');"
                );
            } else {
                if files.get_size(&name_idx).unwrap() < self.opts.base64_cutoff {
                    assert!(removed.insert(i));
                    let data = files.remove(&name_idx).unwrap();
                    uwriteln!(
                        compilation_promises,
                        "const {local_name} = {}('{}');",
                        self.intrinsic(Intrinsic::Base64Compile),
                        general_purpose::STANDARD_NO_PAD.encode(&data),
                    );
                } else {
                    // Maintain numerical file orderings when a previous file was
                    // inlined
                    if let Some(&replacement) = removed.iter().next() {
                        assert!(removed.remove(&replacement) && removed.insert(i));
                        let data = files.remove(&name_idx).unwrap();
                        name_idx = self.core_file_name(name, replacement as u32);
                        files.push(&name_idx, &data);
                    }
                    uwriteln!(
                        compilation_promises,
                        "const {local_name} = {}(new URL('./{name_idx}', import.meta.url));",
                        self.intrinsic(Intrinsic::FetchCompile)
                    );
                }
            }
        }

        if self.opts.instantiation {
            uwrite!(
                output,
                "\
                    {}
                    export async function instantiate(compileCore, imports, instantiateCore = WebAssembly.instantiate) {{
                        {}
                        {}\
                        {};
                    }}
                ",
                &self.src.js_intrinsics as &str,
                &compilation_promises as &str,
                &self.src.js_init as &str,
                &self.src.js as &str,
            );
        } else if self.opts.raw_bindgen {
            output.push_str(&self.src.js_intrinsics);
            output.push_str(&self.src.js);
        } else {
            // Import statements render first in JS instance mode
            for (specifier, bindings) in &self.imports {
                uwrite!(output, "import {{");
                let mut first = true;
                for (external, local) in bindings {
                    if first {
                        output.push_str(" ");
                    } else {
                        output.push_str(", ");
                    }
                    uwrite!(output, "{} as {}", external, local);
                    first = false;
                }
                if !first {
                    output.push_str(" ");
                }
                uwrite!(output, "}} from '{}';\n", specifier);
            }

            let (maybe_init_export, maybe_init) = if self.opts.tla_compat {
                uwriteln!(
                    self.src.ts,
                    "
                    export const $init: Promise<void>;"
                );
                uwriteln!(self.src.js_init, "_initialized = true;");
                (
                    "\
                        let _initialized = false;
                        export ",
                    "",
                )
            } else {
                (
                    "",
                    "
                        await $init;
                    ",
                )
            };

            uwrite!(
                output,
                "\
                    {}
                    {}
                    {maybe_init_export}const $init = (async() => {{
                        {}\
                        {}\
                    }})();
                    {maybe_init}\
                ",
                &self.src.js_intrinsics as &str,
                &self.src.js as &str,
                &compilation_promises as &str,
                &self.src.js_init as &str,
            );
        }

        let mut bytes = output.as_bytes();
        // strip leading newline
        if bytes[0] == b'\n' {
            bytes = &bytes[1..];
        }
        files.push(&format!("{name}.js"), bytes);
        if !self.opts.no_typescript {
            files.push(&format!("{name}.d.ts"), self.src.ts.as_bytes());
        }
    }
}

impl JsBindgen {
    fn import_interface(
        &mut self,
        resolve: &Resolve,
        name: &str,
        id: InterfaceId,
        files: &mut Files,
    ) {
        self.generate_interface(
            name,
            resolve,
            id,
            "imports",
            "Imports",
            files,
            AbiVariant::GuestImport,
        );
        let camel = name.to_upper_camel_case();
        uwriteln!(self.import_object, "'{name}': typeof {camel}Imports,");
    }

    fn import_funcs(
        &mut self,
        resolve: &Resolve,
        _world: WorldId,
        funcs: &[(&str, &Function)],
        _files: &mut Files,
    ) {
        let mut gen = self.js_interface(resolve);
        for (_, func) in funcs {
            gen.ts_func(func, AbiVariant::GuestImport, ",");
        }
        gen.gen.import_object.push_str(&gen.src.ts);
        assert!(gen.src.js.is_empty());
    }

    fn export_interface(
        &mut self,
        resolve: &Resolve,
        name: &str,
        id: InterfaceId,
        files: &mut Files,
    ) {
        self.generate_interface(
            name,
            resolve,
            id,
            "exports",
            "Exports",
            files,
            AbiVariant::GuestExport,
        );
        let camel = name.to_upper_camel_case();
        uwriteln!(self.export_object, "'{name}': typeof {camel}Exports,");
    }

    fn export_funcs(
        &mut self,
        resolve: &Resolve,
        _world: WorldId,
        funcs: &[(&str, &Function)],
        _files: &mut Files,
        end_character: &str,
    ) {
        let mut gen = self.js_interface(resolve);
        for (_, func) in funcs {
            if end_character == ";" {
                gen.src.ts("export function ");
            }
            gen.ts_func(func, AbiVariant::GuestExport, end_character);
        }

        gen.gen.export_object.push_str(&gen.src.ts);
        assert!(gen.src.js.is_empty());
    }

    fn finish(&mut self, resolve: &Resolve, id: WorldId, _files: &mut Files) {
        let world = &resolve.worlds[id];
        let camel = world.name.to_upper_camel_case();

        // Generate a type definition for the import object to type-check
        // all imports to the component.
        //
        // With the current representation of a "world" this is an import object
        // per-imported-interface where the type of that field is defined by the
        // interface itself.
        if self.opts.instantiation {
            uwriteln!(self.src.ts, "export interface ImportObject {{");
            self.src.ts(&self.import_object);
            uwriteln!(self.src.ts, "}}");
        }

        // Generate a type definition for the export object from instantiating
        // the component.
        if self.opts.instantiation {
            uwriteln!(self.src.ts, "export interface {camel} {{",);
            self.src.ts(&self.export_object);
            uwriteln!(self.src.ts, "}}");
        } else {
            self.src.ts(&self.export_object);
        }
    }
}

impl JsBindgen {
    pub fn generate(&mut self, resolve: &Resolve, id: WorldId, files: &mut Files) {
        let world = &resolve.worlds[id];
        self.preprocess(resolve, &world.name);

        let mut funcs = Vec::new();

        for (name, import) in world.imports.iter() {
            match import {
                WorldItem::Function(f) => funcs.push((name.as_str(), f)),
                WorldItem::Interface(id) => self.import_interface(resolve, name, *id, files),
                WorldItem::Type(_) => unimplemented!("type imports"),
            }
        }
        if !funcs.is_empty() {
            self.import_funcs(resolve, id, &funcs, files);
        }
        funcs.clear();
        for (name, export) in world.exports.iter() {
            match export {
                WorldItem::Function(f) => funcs.push((name.as_str(), f)),
                WorldItem::Interface(id) => self.export_interface(resolve, name, *id, files),
                WorldItem::Type(_) => unimplemented!("type exports"),
            }
        }
        if !funcs.is_empty() {
            let end_character = if self.opts.instantiation { "," } else { ";" };
            self.export_funcs(resolve, id, &funcs, files, end_character);
        }
        self.finish(resolve, id, files);
    }

    fn preprocess(&mut self, resolve: &Resolve, name: &str) {
        drop(resolve);
        drop(name);
    }

    fn generate_interface(
        &mut self,
        name: &str,
        resolve: &Resolve,
        id: InterfaceId,
        dir: &str,
        extra: &str,
        files: &mut Files,
        abi: AbiVariant,
    ) {
        let camel = name.to_upper_camel_case();
        let mut gen = self.js_interface(resolve);

        uwriteln!(gen.src.ts, "export namespace {camel} {{");
        for (_, func) in resolve.interfaces[id].functions.iter() {
            gen.src.ts("export function ");
            gen.ts_func(func, abi, ";");
        }
        uwriteln!(gen.src.ts, "}}");

        assert!(gen.src.js.is_empty());
        if !gen.gen.opts.no_typescript {
            gen.types(id);
            gen.post_types();
            files.push(&format!("{dir}/{name}.d.ts"), gen.src.ts.as_bytes());
        }

        uwriteln!(
            self.src.ts,
            "import {{ {camel} as {camel}{extra} }} from './{dir}/{name}';",
        );
    }

    fn map_import(&self, impt: &str) -> String {
        if let Some(map) = self.opts.map.as_ref() {
            for (key, mapping) in map {
                if key == impt {
                    return mapping.into();
                }
                if let Some(wildcard_idx) = key.find('*') {
                    let lhs = &key[0..wildcard_idx];
                    let rhs = &key[wildcard_idx + 1..];
                    if impt.starts_with(lhs) && impt.ends_with(rhs) {
                        let matched =
                            &impt[wildcard_idx..wildcard_idx + impt.len() - lhs.len() - rhs.len()];
                        return mapping.replace('*', matched);
                    }
                }
            }
            if let Some(mapping) = map.get(impt) {
                return mapping.into();
            }
        }
        impt.into()
    }

    fn js_interface<'a>(&'a mut self, resolve: &'a Resolve) -> JsInterface<'a> {
        JsInterface {
            src: Source::default(),
            gen: self,
            resolve,
            needs_ty_option: false,
            needs_ty_result: false,
        }
    }

    /// Emits the intrinsic `i` to this file and then returns the name of the
    /// intrinsic.
    fn intrinsic(&mut self, i: Intrinsic) -> String {
        let name = i.name().to_string();
        if !self.all_intrinsics.insert(i) {
            return name;
        }

        if (i == Intrinsic::I32ToF32 && !self.all_intrinsics.contains(&Intrinsic::F32ToI32))
            || (i == Intrinsic::F32ToI32 && !self.all_intrinsics.contains(&Intrinsic::I32ToF32))
        {
            self.src.js_intrinsics(
                "
                const i32ToF32I = new Int32Array(1);
                const i32ToF32F = new Float32Array(i32ToF32I.buffer);
            ",
            );
        }
        if (i == Intrinsic::I64ToF64 && !self.all_intrinsics.contains(&Intrinsic::F64ToI64))
            || (i == Intrinsic::F64ToI64 && !self.all_intrinsics.contains(&Intrinsic::I64ToF64))
        {
            self.src.js_intrinsics(
                "
                const i64ToF64I = new BigInt64Array(1);
                const i64ToF64F = new Float64Array(i64ToF64I.buffer);
            ",
            );
        }

        match i {
            Intrinsic::ClampGuest => self.src.js_intrinsics("
                function clampGuest(i, min, max) {
                    if (i < min || i > max) \
                        throw new TypeError(`must be between ${min} and ${max}`);
                    return i;
                }
            "),

            Intrinsic::HasOwnProperty => self.src.js_intrinsics("
                const hasOwnProperty = Object.prototype.hasOwnProperty;
            "),

            Intrinsic::GetErrorPayload => {
                let hop = self.intrinsic(Intrinsic::HasOwnProperty);
                uwrite!(self.src.js_intrinsics, "
                    function getErrorPayload(e) {{
                        if ({hop}.call(e, 'payload')) return e.payload;
                        if ({hop}.call(e, 'message')) return String(e.message);
                        return String(e);
                    }}
                ")
            },

            Intrinsic::ComponentError => self.src.js_intrinsics("
                class ComponentError extends Error {
                    constructor (value) {
                        const enumerable = typeof value !== 'string';
                        super(enumerable ? `${String(value)} (see error.payload)` : value);
                        Object.defineProperty(this, 'payload', { value, enumerable });
                    }
                }
            "),

            Intrinsic::DataView => self.src.js_intrinsics("
                let dv = new DataView(new ArrayBuffer());
                const dataView = mem => dv.buffer === mem.buffer ? dv : dv = new DataView(mem.buffer);
            "),

            Intrinsic::FetchCompile => if !self.opts.no_nodejs_compat {
                self.src.js_intrinsics("
                    const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
                    let _fs;
                    async function fetchCompile (url) {
                        if (isNode) {
                            _fs = _fs || await import('fs/promises');
                            return WebAssembly.compile(await _fs.readFile(url));
                        }
                        return fetch(url).then(WebAssembly.compileStreaming);
                    }
                ")
            } else {
                self.src.js_intrinsics("
                    const fetchCompile = url => fetch(url).then(WebAssembly.compileStreaming);
                ")
            },

            Intrinsic::Base64Compile => if !self.opts.no_nodejs_compat {
                self.src.js_intrinsics("
                    const base64Compile = str => WebAssembly.compile(typeof Buffer !== 'undefined' ? Buffer.from(str, 'base64') : Uint8Array.from(atob(str), b => b.charCodeAt(0)));
                ")
            } else {
                self.src.js_intrinsics("
                    const base64Compile = str => WebAssembly.compile(Uint8Array.from(atob(str), b => b.charCodeAt(0)));
                ")
            },

            Intrinsic::InstantiateCore => if !self.opts.instantiation {
                self.src.js_intrinsics("
                    const instantiateCore = WebAssembly.instantiate;
                ")
            },

            Intrinsic::IsLE => self.src.js_intrinsics("
                const isLE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
            "),

            Intrinsic::ValidateGuestChar => self.src.js_intrinsics("
                function validateGuestChar(i) {
                    if ((i > 0x10ffff) || (i >= 0xd800 && i <= 0xdfff)) \
                        throw new TypeError(`not a valid char`);
                    return String.fromCodePoint(i);
                }
            "),

            // TODO: this is incorrect. It at least allows strings of length > 0
            // but it probably doesn't do the right thing for unicode or invalid
            // utf16 strings either.
            Intrinsic::ValidateHostChar => self.src.js_intrinsics("
                function validateHostChar(s) {
                    if (typeof s !== 'string') \
                        throw new TypeError(`must be a string`);
                    return s.codePointAt(0);
                }
            "),


            Intrinsic::ToInt32 => self.src.js_intrinsics("
                function toInt32(val) {
                    return val >> 0;
                }
            "),
            Intrinsic::ToUint32 => self.src.js_intrinsics("
                function toUint32(val) {
                    return val >>> 0;
                }
            "),

            Intrinsic::ToInt16 => self.src.js_intrinsics("
                function toInt16(val) {
                    val >>>= 0;
                    val %= 2 ** 16;
                    if (val >= 2 ** 15) {
                        val -= 2 ** 16;
                    }
                    return val;
                }
            "),
            Intrinsic::ToUint16 => self.src.js_intrinsics("
                function toUint16(val) {
                    val >>>= 0;
                    val %= 2 ** 16;
                    return val;
                }
            "),
            Intrinsic::ToInt8 => self.src.js_intrinsics("
                function toInt8(val) {
                    val >>>= 0;
                    val %= 2 ** 8;
                    if (val >= 2 ** 7) {
                        val -= 2 ** 8;
                    }
                    return val;
                }
            "),
            Intrinsic::ToUint8 => self.src.js_intrinsics("
                function toUint8(val) {
                    val >>>= 0;
                    val %= 2 ** 8;
                    return val;
                }
            "),

            Intrinsic::ToBigInt64 => self.src.js_intrinsics("
                const toInt64 = val => BigInt.asIntN(64, val);
            "),
            Intrinsic::ToBigUint64 => self.src.js_intrinsics("
                const toUint64 = val => BigInt.asUintN(64, val);
            "),

            // Calling `String` almost directly calls `ToString`, except that it also allows symbols,
            // which is why we have the symbol-rejecting branch above.
            //
            // Definition of `String`: https://tc39.es/ecma262/#sec-string-constructor-string-value
            Intrinsic::ToString => self.src.js_intrinsics("
                function toString(val) {
                    if (typeof val === 'symbol') throw new TypeError('symbols cannot be converted to strings');
                    return String(val);
                }
            "),

            Intrinsic::I32ToF32 => self.src.js_intrinsics("
                const i32ToF32 = i => (i32ToF32I[0] = i, i32ToF32F[0]);
            "),
            Intrinsic::F32ToI32 => self.src.js_intrinsics("
                const f32ToI32 = f => (i32ToF32F[0] = f, i32ToF32I[0]);
            "),
            Intrinsic::I64ToF64 => self.src.js_intrinsics("
                const i64ToF64 = i => (i64ToF64I[0] = i, i64ToF64F[0]);
            "),
            Intrinsic::F64ToI64 => self.src.js_intrinsics("
                const f64ToI64 = f => (i64ToF64F[0] = f, i64ToF64I[0]);
            "),

            Intrinsic::Utf8Decoder => self.src.js_intrinsics("
                const utf8Decoder = new TextDecoder();
            "),

            Intrinsic::Utf16Decoder => self.src.js_intrinsics("
                const utf16Decoder = new TextDecoder('utf-16');
            "),

            Intrinsic::Utf8EncodedLen => {},

            Intrinsic::Utf8Encode => self.src.js_intrinsics("
                const utf8Encoder = new TextEncoder();

                let utf8EncodedLen = 0;
                function utf8Encode(s, realloc, memory) {
                    if (typeof s !== 'string') \
                        throw new TypeError('expected a string');
                    if (s.length === 0) {
                        utf8EncodedLen = 0;
                        return 1;
                    }
                    let allocLen = 0;
                    let ptr = 0;
                    let writtenTotal = 0;
                    while (s.length > 0) {
                        ptr = realloc(ptr, allocLen, 1, allocLen + s.length);
                        allocLen += s.length;
                        const { read, written } = utf8Encoder.encodeInto(
                            s,
                            new Uint8Array(memory.buffer, ptr + writtenTotal, allocLen - writtenTotal),
                        );
                        writtenTotal += written;
                        s = s.slice(read);
                    }
                    if (allocLen > writtenTotal)
                        ptr = realloc(ptr, allocLen, 1, writtenTotal);
                    utf8EncodedLen = writtenTotal;
                    return ptr;
                }
            "),

            Intrinsic::Utf16Encode => {
                let is_le = self.intrinsic(Intrinsic::IsLE);
                uwrite!(self.src.js_intrinsics, "
                    function utf16Encode (str, realloc, memory) {{
                        const len = str.length, ptr = realloc(0, 0, 2, len * 2), out = new Uint16Array(memory.buffer, ptr, len);
                        let i = 0;
                        if ({is_le}) {{
                            while (i < len) out[i] = str.charCodeAt(i++);
                        }} else {{
                            while (i < len) {{
                                const ch = str.charCodeAt(i);
                                out[i++] = (ch & 0xff) << 8 | ch >>> 8;
                            }}
                        }}
                        return ptr;
                    }}
                ");
            },

            Intrinsic::ThrowInvalidBool => self.src.js_intrinsics("
                function throwInvalidBool() {
                    throw new TypeError('invalid variant discriminant for bool');
                }
            "),

            Intrinsic::ThrowUninitialized => self.src.js_intrinsics("
                function throwUninitialized() {
                    throw new TypeError('Wasm uninitialized use `await $init` first');
                }
            "),
        }

        name
    }

    fn array_ty(&self, resolve: &Resolve, ty: &Type) -> Option<&'static str> {
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
            Type::Id(id) => match &resolve.types[*id].kind {
                TypeDefKind::Type(t) => self.array_ty(resolve, t),
                _ => None,
            },
        }
    }

    /// Returns whether `null` is a valid value of type `ty`
    fn maybe_null(&self, resolve: &Resolve, ty: &Type) -> bool {
        self.as_nullable(resolve, ty).is_some()
    }

    /// Tests whether `ty` can be represented with `null`, and if it can then
    /// the "other type" is returned. If `Some` is returned that means that `ty`
    /// is `null | <return>`. If `None` is returned that means that `null` can't
    /// be used to represent `ty`.
    fn as_nullable<'a>(&self, resolve: &'a Resolve, ty: &'a Type) -> Option<&'a Type> {
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
                if !self.maybe_null(resolve, t) {
                    Some(t)
                } else {
                    None
                }
            }
            TypeDefKind::Type(t) => self.as_nullable(resolve, t),
            _ => None,
        }
    }
}

/// Helper structure used to generate the `instantiate` method of a component.
///
/// This is the main structure for parsing the output of Wasmtime.
struct Instantiator<'a> {
    src: Source,
    gen: &'a mut JsBindgen,
    modules: &'a PrimaryMap<StaticModuleIndex, ModuleTranslation<'a>>,
    instances: PrimaryMap<RuntimeInstanceIndex, StaticModuleIndex>,
    resolve: &'a Resolve,
    world: WorldId,
    sizes: SizeAlign,
    component: &'a Component,
}

impl Instantiator<'_> {
    fn instantiate(&mut self) {
        // To avoid uncaught promise rejection errors, we attach an intermediate
        // Promise.all with a rejection handler, if there are multiple promises.
        if self.modules.len() > 1 {
            self.src.js_init.push_str("Promise.all([");
            for i in 0..self.modules.len() {
                if i > 0 {
                    self.src.js_init.push_str(", ");
                }
                self.src.js_init.push_str(&format!("module{}", i));
            }
            uwriteln!(self.src.js_init, "]).catch(() => {{}});");
        }

        for init in self.component.initializers.iter() {
            self.instantiation_global_initializer(init);
        }

        if self.gen.opts.instantiation {
            let js_init = mem::take(&mut self.src.js_init);
            self.src.js.push_str(&js_init);
            self.src.js("return ");
        }

        self.exports(&self.component.exports);
    }

    fn instantiation_global_initializer(&mut self, init: &GlobalInitializer) {
        match init {
            GlobalInitializer::InstantiateModule(m) => match m {
                InstantiateModule::Static(idx, args) => self.instantiate_static_module(*idx, args),
                // This is only needed when instantiating an imported core wasm
                // module which while easy to implement here is not possible to
                // test at this time so it's left unimplemented.
                InstantiateModule::Import(..) => unimplemented!(),
            },
            GlobalInitializer::LowerImport(i) => {
                self.lower_import(i);
            }
            GlobalInitializer::ExtractMemory(m) => {
                let def = self.core_export(&m.export);
                let idx = m.index.as_u32();
                uwriteln!(self.src.js, "let memory{idx};");
                uwriteln!(self.src.js_init, "memory{idx} = {def};");
            }
            GlobalInitializer::ExtractRealloc(r) => {
                let def = self.core_def(&r.def);
                let idx = r.index.as_u32();
                uwriteln!(self.src.js, "let realloc{idx};");
                uwriteln!(self.src.js_init, "realloc{idx} = {def};",);
            }
            GlobalInitializer::ExtractPostReturn(p) => {
                let def = self.core_def(&p.def);
                let idx = p.index.as_u32();
                uwriteln!(self.src.js, "let postReturn{idx};");
                uwriteln!(self.src.js_init, "postReturn{idx} = {def};");
            }

            // This is only used for a "degenerate component" which internally
            // has a function that always traps. While this should be trivial to
            // implement (generate a JS function that always throws) there's no
            // way to test this at this time so leave this unimplemented.
            GlobalInitializer::AlwaysTrap(_) => unimplemented!(),

            // This is only used when the component exports core wasm modules,
            // but that's not possible to test right now so leave these as
            // unimplemented.
            GlobalInitializer::SaveStaticModule(_) => unimplemented!(),
            GlobalInitializer::SaveModuleImport(_) => unimplemented!(),

            // This is required when strings pass between components within a
            // component and may change encodings. This is left unimplemented
            // for now since it can't be tested and additionally JS doesn't
            // support multi-memory which transcoders rely on anyway.
            GlobalInitializer::Transcoder(_) => unimplemented!(),
        }
    }

    fn instantiate_static_module(&mut self, idx: StaticModuleIndex, args: &[CoreDef]) {
        let module = &self.modules[idx].module;

        // Build a JS "import object" which represents `args`. The `args` is a
        // flat representation which needs to be zip'd with the list of names to
        // correspond to the JS wasm embedding API. This is one of the major
        // differences between Wasmtime's and JS's embedding API.
        let mut import_obj = BTreeMap::new();
        assert_eq!(module.imports().len(), args.len());
        for ((module, name, _), arg) in module.imports().zip(args) {
            let def = self.core_def(arg);
            let dst = import_obj.entry(module).or_insert(BTreeMap::new());
            let prev = dst.insert(name, def);
            assert!(prev.is_none());
        }
        let mut imports = String::new();
        if !import_obj.is_empty() {
            imports.push_str(", {\n");
            for (module, names) in import_obj {
                if is_js_identifier(module) {
                    imports.push_str(module);
                } else {
                    uwrite!(imports, "'{module}'");
                }
                imports.push_str(": {\n");
                for (name, val) in names {
                    if is_js_identifier(name) {
                        imports.push_str(name);
                    } else {
                        uwrite!(imports, "'{name}'");
                    }
                    uwriteln!(imports, ": {val},");
                }
                imports.push_str("},\n");
            }
            imports.push_str("}");
        }

        let i = self.instances.push(idx);
        let iu32 = i.as_u32();
        let instantiate = self.gen.intrinsic(Intrinsic::InstantiateCore);
        uwriteln!(self.src.js, "let exports{iu32};");
        uwriteln!(
            self.src.js_init,
            "({{ exports: exports{iu32} }} = await {instantiate}(await module{}{imports}));",
            idx.as_u32()
        );
    }

    fn lower_import(&mut self, import: &LowerImport) {
        // Determine the `Interface` that this import corresponds to. At this
        // time `wit-component` only supports root-level imports of instances
        // where instances export functions.
        let (import_index, path) = &self.component.imports[import.import];
        let (import_name, _import_ty) = &self.component.import_types[*import_index];
        let func = match &self.resolve.worlds[self.world].imports[import_name.as_str()] {
            WorldItem::Function(f) => {
                assert_eq!(path.len(), 0);
                f
            }
            WorldItem::Interface(i) => {
                assert_eq!(path.len(), 1);
                &self.resolve.interfaces[*i].functions[&path[0]]
            }
            WorldItem::Type(_) => unreachable!(),
        };

        let index = import.index.as_u32();
        let callee = format!("lowering{index}Callee");

        let import_specifier = self.gen.map_import(import_name);

        let id = func.name.to_lower_camel_case();

        // instance imports are otherwise hoisted
        if self.gen.opts.instantiation {
            uwriteln!(
                self.src.js,
                "const {callee} = imports{}.{};",
                if is_js_identifier(&import_specifier) {
                    format!(".{}", import_specifier)
                } else {
                    format!("['{}']", import_specifier)
                },
                id
            );
        } else {
            let imports_vec = self
                .gen
                .imports
                .entry(import_specifier)
                .or_insert(Vec::new());
            imports_vec.push((id, callee.clone()));
        }

        uwrite!(self.src.js, "\nfunction lowering{index}");
        let nparams = self
            .resolve
            .wasm_signature(AbiVariant::GuestImport, func)
            .params
            .len();
        let prev = mem::take(&mut self.src);
        self.bindgen(
            nparams,
            callee,
            &import.options,
            func,
            AbiVariant::GuestImport,
        );
        let latest = mem::replace(&mut self.src, prev);
        assert!(latest.ts.is_empty());
        assert!(latest.js_init.is_empty());
        self.src.js_intrinsics(&latest.js_intrinsics);
        self.src.js(&latest.js);
        uwriteln!(self.src.js, "");
    }

    fn bindgen(
        &mut self,
        nparams: usize,
        callee: String,
        opts: &CanonicalOptions,
        func: &Function,
        abi: AbiVariant,
    ) {
        let memory = match opts.memory {
            Some(idx) => Some(format!("memory{}", idx.as_u32())),
            None => None,
        };
        let realloc = match opts.realloc {
            Some(idx) => Some(format!("realloc{}", idx.as_u32())),
            None => None,
        };
        let post_return = match opts.post_return {
            Some(idx) => Some(format!("postReturn{}", idx.as_u32())),
            None => None,
        };

        self.src.js("(");
        let mut params = Vec::new();
        for i in 0..nparams {
            if i > 0 {
                self.src.js(", ");
            }
            let param = format!("arg{i}");
            self.src.js(&param);
            params.push(param);
        }
        uwriteln!(self.src.js, ") {{");

        if self.gen.opts.tla_compat && matches!(abi, AbiVariant::GuestExport) {
            let throw_uninitialized = self.gen.intrinsic(Intrinsic::ThrowUninitialized);
            uwrite!(
                self.src.js,
                "\
                if (!_initialized) {throw_uninitialized}();
            "
            );
        }

        let mut f = FunctionBindgen {
            intrinsics: BTreeSet::new(),
            valid_lifting_optimization: self.gen.opts.valid_lifting_optimization,
            sizes: &self.sizes,
            err: if func.results.throws(self.resolve).is_some() {
                match abi {
                    AbiVariant::GuestExport => ErrHandling::ThrowResultErr,
                    AbiVariant::GuestImport => ErrHandling::ResultCatchHandler,
                }
            } else {
                ErrHandling::None
            },
            block_storage: Vec::new(),
            blocks: Vec::new(),
            callee,
            memory,
            realloc,
            tmp: 0,
            params,
            post_return,
            encoding: opts.string_encoding,
            src: source::Source::default(),
        };
        self.resolve.call(
            abi,
            match abi {
                AbiVariant::GuestImport => LiftLower::LiftArgsLowerResults,
                AbiVariant::GuestExport => LiftLower::LowerArgsLiftResults,
            },
            func,
            &mut f,
        );
        for intrinsic in f.intrinsics {
            self.gen.intrinsic(intrinsic);
        }
        self.src.js(&f.src);
        self.src.js("}");
    }

    fn core_def(&self, def: &CoreDef) -> String {
        match def {
            CoreDef::Export(e) => self.core_export(e),
            CoreDef::Lowered(i) => format!("lowering{}", i.as_u32()),
            CoreDef::AlwaysTrap(_) => unimplemented!(),
            CoreDef::InstanceFlags(_) => unimplemented!(),
            CoreDef::Transcoder(_) => unimplemented!(),
        }
    }

    fn core_export<T>(&self, export: &CoreExport<T>) -> String
    where
        T: Into<EntityIndex> + Copy,
    {
        let name = match &export.item {
            ExportItem::Index(idx) => {
                let module = &self.modules[self.instances[export.instance]].module;
                let idx = (*idx).into();
                module
                    .exports
                    .iter()
                    .filter_map(|(name, i)| if *i == idx { Some(name) } else { None })
                    .next()
                    .unwrap()
            }
            ExportItem::Name(s) => s,
        };
        let i = export.instance.as_u32() as usize;
        if is_js_identifier(name) {
            format!("exports{i}.{name}")
        } else {
            format!("exports{i}['{name}']")
        }
    }

    fn exports(&mut self, exports: &IndexMap<String, Export>) {
        if exports.is_empty() {
            if self.gen.opts.instantiation {
                self.src.js("{}");
            }
            return;
        }

        if self.gen.opts.instantiation {
            uwriteln!(self.src.js, "{{");
        }

        let mut camel_exports = Vec::new();
        for (name, export) in exports {
            let item = &self.resolve.worlds[self.world].exports[name];
            let camel = name.to_lower_camel_case();
            match export {
                Export::LiftedFunction {
                    ty: _,
                    func,
                    options,
                } => {
                    self.export_bindgen(
                        name,
                        None,
                        func,
                        options,
                        match item {
                            WorldItem::Function(f) => f,
                            WorldItem::Interface(_) | WorldItem::Type(_) => unreachable!(),
                        },
                    );
                }
                Export::Instance(exports) => {
                    let id = match item {
                        WorldItem::Interface(id) => *id,
                        WorldItem::Function(_) | WorldItem::Type(_) => unreachable!(),
                    };
                    if self.gen.opts.instantiation {
                        uwriteln!(self.src.js, "{camel}: {{");
                    } else {
                        uwriteln!(self.src.js, "const {camel} = {{");
                    }
                    for (func_name, export) in exports {
                        let (func, options) = match export {
                            Export::LiftedFunction { func, options, .. } => (func, options),
                            Export::Type(_) => continue, // ignored
                            _ => unreachable!(),
                        };
                        self.export_bindgen(
                            func_name,
                            Some(name),
                            func,
                            options,
                            &self.resolve.interfaces[id].functions[func_name],
                        );
                    }
                    self.src.js("\n}");
                    if self.gen.opts.instantiation {
                        self.src.js(",\n");
                    } else {
                        self.src.js(";\n");
                    }
                }

                // ignore type exports for now
                Export::Type(_) => {}

                // This can't be tested at this time so leave it unimplemented
                Export::Module(_) => unimplemented!(),
            }
            camel_exports.push(camel);
        }
        if self.gen.opts.instantiation {
            self.src.js("}");
        } else if !self.gen.opts.raw_bindgen {
            uwriteln!(self.src.js, "\nexport {{ {} }}", camel_exports.join(", "));
        }
    }

    fn export_bindgen(
        &mut self,
        name: &str,
        instance_name: Option<&str>,
        def: &CoreDef,
        options: &CanonicalOptions,
        func: &Function,
    ) {
        let name = name.to_lower_camel_case();
        if self.gen.opts.instantiation || instance_name.is_some() {
            self.src.js.push_str(&name);
        } else {
            uwrite!(self.src.js, "\nfunction {name}");
        }
        let callee = self.core_def(def);
        self.bindgen(
            func.params.len(),
            callee,
            options,
            func,
            AbiVariant::GuestExport,
        );
        if self.gen.opts.instantiation || instance_name.is_some() {
            self.src.js(",\n");
        } else {
            self.src.js("\n");
        }
    }
}

#[derive(Copy, Clone)]
enum Mode {
    Lift,
    Lower,
}

impl<'a> JsInterface<'a> {
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

    fn types(&mut self, iface: InterfaceId) {
        let iface = &self.resolve().interfaces[iface];
        for (name, id) in iface.types.iter() {
            let id = *id;
            let ty = &self.resolve().types[id];
            match &ty.kind {
                TypeDefKind::Record(record) => self.type_record(id, name, record, &ty.docs),
                TypeDefKind::Flags(flags) => self.type_flags(id, name, flags, &ty.docs),
                TypeDefKind::Tuple(tuple) => self.type_tuple(id, name, tuple, &ty.docs),
                TypeDefKind::Enum(enum_) => self.type_enum(id, name, enum_, &ty.docs),
                TypeDefKind::Variant(variant) => self.type_variant(id, name, variant, &ty.docs),
                TypeDefKind::Option(t) => self.type_option(id, name, t, &ty.docs),
                TypeDefKind::Result(r) => self.type_result(id, name, r, &ty.docs),
                TypeDefKind::Union(u) => self.type_union(id, name, u, &ty.docs),
                TypeDefKind::List(t) => self.type_list(id, name, t, &ty.docs),
                TypeDefKind::Type(t) => self.type_alias(id, name, t, &iface.name, &ty.docs),
                TypeDefKind::Future(_) => todo!("generate for future"),
                TypeDefKind::Stream(_) => todo!("generate for stream"),
                TypeDefKind::Unknown => unreachable!(),
            }
        }
    }

    fn array_ty(&self, ty: &Type) -> Option<&'static str> {
        self.gen.array_ty(self.resolve, ty)
    }

    fn print_ty(&mut self, ty: &Type, mode: Mode) {
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
                let ty = &self.resolve.types[*id];
                if let Some(name) = &ty.name {
                    return self.src.ts(&name.to_upper_camel_case());
                }
                match &ty.kind {
                    TypeDefKind::Type(t) => self.print_ty(t, mode),
                    TypeDefKind::Tuple(t) => self.print_tuple(t, mode),
                    TypeDefKind::Record(_) => panic!("anonymous record"),
                    TypeDefKind::Flags(_) => panic!("anonymous flags"),
                    TypeDefKind::Enum(_) => panic!("anonymous enum"),
                    TypeDefKind::Union(_) => panic!("anonymous union"),
                    TypeDefKind::Option(t) => {
                        if self.maybe_null(t) {
                            self.needs_ty_option = true;
                            self.src.ts("Option<");
                            self.print_ty(t, mode);
                            self.src.ts(">");
                        } else {
                            self.print_ty(t, mode);
                            self.src.ts(" | null");
                        }
                    }
                    TypeDefKind::Result(r) => {
                        self.needs_ty_result = true;
                        self.src.ts("Result<");
                        self.print_optional_ty(r.ok.as_ref(), mode);
                        self.src.ts(", ");
                        self.print_optional_ty(r.err.as_ref(), mode);
                        self.src.ts(">");
                    }
                    TypeDefKind::Variant(_) => panic!("anonymous variant"),
                    TypeDefKind::List(v) => self.print_list(v, mode),
                    TypeDefKind::Future(_) => todo!("anonymous future"),
                    TypeDefKind::Stream(_) => todo!("anonymous stream"),
                    TypeDefKind::Unknown => unreachable!(),
                }
            }
        }
    }

    fn print_optional_ty(&mut self, ty: Option<&Type>, mode: Mode) {
        match ty {
            Some(ty) => self.print_ty(ty, mode),
            None => self.src.ts("void"),
        }
    }

    fn print_list(&mut self, ty: &Type, mode: Mode) {
        match self.array_ty(ty) {
            Some("Uint8Array") => match mode {
                Mode::Lift => self.src.ts("Uint8Array"),
                Mode::Lower => self.src.ts("Uint8Array | ArrayBuffer"),
            },
            Some(ty) => self.src.ts(ty),
            None => {
                self.print_ty(ty, mode);
                self.src.ts("[]");
            }
        }
    }

    fn print_tuple(&mut self, tuple: &Tuple, mode: Mode) {
        self.src.ts("[");
        for (i, ty) in tuple.types.iter().enumerate() {
            if i > 0 {
                self.src.ts(", ");
            }
            self.print_ty(ty, mode);
        }
        self.src.ts("]");
    }

    fn ts_func(&mut self, func: &Function, abi: AbiVariant, end_character: &str) {
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
            self.print_ty(
                ty,
                match abi {
                    AbiVariant::GuestExport => Mode::Lower,
                    AbiVariant::GuestImport => Mode::Lift,
                },
            );
        }
        self.src.ts("): ");
        let result_mode = match abi {
            AbiVariant::GuestExport => Mode::Lift,
            AbiVariant::GuestImport => Mode::Lower,
        };
        if let Some((ok_ty, _)) = func.results.throws(self.resolve) {
            self.print_optional_ty(ok_ty, result_mode);
        } else {
            match func.results.len() {
                0 => self.src.ts("void"),
                1 => self.print_ty(func.results.iter_types().next().unwrap(), result_mode),
                _ => {
                    self.src.ts("[");
                    for (i, ty) in func.results.iter_types().enumerate() {
                        if i != 0 {
                            self.src.ts(", ");
                        }
                        self.print_ty(ty, result_mode);
                    }
                    self.src.ts("]");
                }
            }
        }
        self.src.ts(format!("{}\n", end_character).as_str());
    }

    fn maybe_null(&self, ty: &Type) -> bool {
        self.gen.maybe_null(self.resolve, ty)
    }

    fn as_nullable<'b>(&self, ty: &'b Type) -> Option<&'b Type>
    where
        'a: 'b,
    {
        self.gen.as_nullable(self.resolve, ty)
    }

    fn post_types(&mut self) {
        if mem::take(&mut self.needs_ty_option) {
            self.src
                .ts("export type Option<T> = { tag: 'none' } | { tag: 'some', val: T };\n");
        }
        if mem::take(&mut self.needs_ty_result) {
            self.src
                .ts("export type Result<T, E> = { tag: 'ok', val: T } | { tag: 'err', val: E };\n");
        }
    }
}

impl<'a> JsInterface<'a> {
    fn resolve(&self) -> &'a Resolve {
        self.resolve
    }

    fn type_record(&mut self, _id: TypeId, name: &str, record: &Record, docs: &Docs) {
        self.docs(docs);
        self.src.ts(&format!(
            "export interface {} {{\n",
            name.to_upper_camel_case()
        ));
        for field in record.fields.iter() {
            self.docs(&field.docs);
            let (option_str, ty) = self
                .as_nullable(&field.ty)
                .map_or(("", &field.ty), |ty| ("?", ty));
            self.src.ts(&format!(
                "{}{}: ",
                field.name.to_lower_camel_case(),
                option_str
            ));
            self.print_ty(ty, Mode::Lift);
            self.src.ts(",\n");
        }
        self.src.ts("}\n");
    }

    fn type_tuple(&mut self, _id: TypeId, name: &str, tuple: &Tuple, docs: &Docs) {
        self.docs(docs);
        self.src
            .ts(&format!("export type {} = ", name.to_upper_camel_case()));
        self.print_tuple(tuple, Mode::Lift);
        self.src.ts(";\n");
    }

    fn type_flags(&mut self, _id: TypeId, name: &str, flags: &Flags, docs: &Docs) {
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

    fn type_variant(&mut self, _id: TypeId, name: &str, variant: &Variant, docs: &Docs) {
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
            self.src.ts("tag: '");
            self.src.ts(&case.name);
            self.src.ts("',\n");
            if let Some(ty) = case.ty {
                self.src.ts("val: ");
                self.print_ty(&ty, Mode::Lift);
                self.src.ts(",\n");
            }
            self.src.ts("}\n");
        }
    }

    fn type_union(&mut self, _id: TypeId, name: &str, union: &Union, docs: &Docs) {
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
            self.print_ty(&case.ty, Mode::Lift);
            self.src.ts(",\n");
            self.src.ts("}\n");
        }
    }

    fn type_option(&mut self, _id: TypeId, name: &str, payload: &Type, docs: &Docs) {
        self.docs(docs);
        let name = name.to_upper_camel_case();
        self.src.ts(&format!("export type {name} = "));
        if self.maybe_null(payload) {
            self.needs_ty_option = true;
            self.src.ts("Option<");
            self.print_ty(payload, Mode::Lift);
            self.src.ts(">");
        } else {
            self.print_ty(payload, Mode::Lift);
            self.src.ts(" | null");
        }
        self.src.ts(";\n");
    }

    fn type_result(&mut self, _id: TypeId, name: &str, result: &Result_, docs: &Docs) {
        self.docs(docs);
        let name = name.to_upper_camel_case();
        self.needs_ty_result = true;
        self.src.ts(&format!("export type {name} = Result<"));
        self.print_optional_ty(result.ok.as_ref(), Mode::Lift);
        self.src.ts(", ");
        self.print_optional_ty(result.err.as_ref(), Mode::Lift);
        self.src.ts(">;\n");
    }

    fn type_enum(&mut self, _id: TypeId, name: &str, enum_: &Enum, docs: &Docs) {
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
            self.src.ts(&format!("'{}'", case.name));
        }
        self.src.ts(";\n");
    }

    fn type_alias(
        &mut self,
        _id: TypeId,
        name: &str,
        ty: &Type,
        interface: &Option<String>,
        docs: &Docs,
    ) {
        let owner = match ty {
            Type::Id(type_def_id) => {
                let ty = &self.resolve.types[*type_def_id];
                match ty.owner {
                    TypeOwner::Interface(i) => self.resolve.interfaces[i].name.clone(),
                    _ => None,
                }
            }
            _ => None,
        };
        let type_name = name.to_upper_camel_case();
        match owner {
            Some(interface_name) if owner != *interface => {
                uwriteln!(
                    self.src.ts,
                    "import type {{ {type_name} }} from '../imports/{interface_name}';",
                );
                self.src.ts(&format!("export {{ {} }};\n", type_name));
            }
            _ => {
                self.docs(docs);
                self.src.ts(&format!("export type {} = ", type_name));
                self.print_ty(ty, Mode::Lift);
                self.src.ts(";\n");
            }
        }
    }

    fn type_list(&mut self, _id: TypeId, name: &str, ty: &Type, docs: &Docs) {
        self.docs(docs);
        self.src
            .ts(&format!("export type {} = ", name.to_upper_camel_case()));
        self.print_list(ty, Mode::Lift);
        self.src.ts(";\n");
    }
}

#[derive(Default)]
pub struct Source {
    pub js: source::Source,
    pub js_intrinsics: source::Source,
    pub js_init: source::Source,
    pub ts: source::Source,
}

impl Source {
    pub fn js(&mut self, s: &str) {
        self.js.push_str(s);
    }
    pub fn js_intrinsics(&mut self, s: &str) {
        self.js_intrinsics.push_str(s);
    }
    pub fn js_init(&mut self, s: &str) {
        self.js_init.push_str(s);
    }
    pub fn ts(&mut self, s: &str) {
        self.ts.push_str(s);
    }
}

fn to_js_ident(name: &str) -> &str {
    match name {
        "in" => "in_",
        "import" => "import_",
        s => s,
    }
}

// https://tc39.es/ecma262/#prod-IdentifierStartChar
// Unicode ID_Start | "$" | "_"
fn is_js_identifier_start(code: char) -> bool {
    return match code {
        'A'..='Z' | 'a'..='z' | '$' | '_' => true,
        // leaving out non-ascii for now...
        _ => false,
    };
}

// https://tc39.es/ecma262/#prod-IdentifierPartChar
// Unicode ID_Continue | "$" | U+200C | U+200D
fn is_js_identifier_char(code: char) -> bool {
    return match code {
        '0'..='9' | 'A'..='Z' | 'a'..='z' | '$' | '_' => true,
        // leaving out non-ascii for now...
        _ => false,
    };
}

fn is_js_identifier(s: &str) -> bool {
    let mut chars = s.chars();
    if let Some(char) = chars.next() {
        if !is_js_identifier_start(char) {
            return false;
        }
    } else {
        return false;
    }
    while let Some(char) = chars.next() {
        if !is_js_identifier_char(char) {
            return false;
        }
    }
    return true;
}
