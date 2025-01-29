//! Support for transpiling core modules using multi-memory to those that don't
//! use multi-memory.
//!
//! Wasmtime's implementation of adapter modules between components requires the
//! usage of multi-memory for copying data back and forth between two
//! components. The multi-memory proposal is, at this time, not stable in any JS
//! engine. This module is an attempt to polyfill this until at such a time that
//! multi-memory can be used natively.
//!
//! The purpose of this module is to identify core wasms which require
//! multi-memory coming out of Wasmtime. These wasms are rewritten to not
//! actually use more than one memory. The implementation here is to replace all
//! memory instructions operating on memory index 1 or greater with function
//! calls where JS is the one that does the load/store/etc. This is not expected
//! to be fast at runtime but is intended to be just enough to get this working
//! in JS environments at this time. The true speed is expected to come with the
//! multi-memory proposal.
//!
//! This module exports a [`Translation`] which wraps a [`ModuleTranslation`]
//! either as a pass-through "normal" or an "augmented" version where
//! "augmented" means that the original wasm is not used but instead a
//! recompiled copy without multiple memories is used. When calculating the
//! imports for the "augmented" module the arguments for JS functions that
//! read/write memory are automatically injected and handled.
//!
//! Callers of this module need to have an implementation in JS for all of the
//! entries listed in [`AugmentedOp`], likely through the `DataView` class in
//! JS.
//!
//! Note that at this time this module is not intended to be a complete and
//! general purpose method of compiling multiple memories to single-memory
//! modules. This does not handle all instructions that use memory for example,
//! but only those that Wasmtime's adapter modules emits. It's possible to add
//! support for more instructions but such support isn't required at this time.
//! Examples of unsupported instructions are `i64.load8_u` and `memory.copy`.
//! Additionally core wasm sections such as data sections and tables are not
//! supported because, again, Wasmtime doesn't use it at this time.

use anyhow::{bail, Result};
use std::collections::{HashMap, HashSet};
use wasm_encoder::*;
use wasmparser::*;
use wasmtime_environ::component::CoreDef;
use wasmtime_environ::{EntityIndex, MemoryIndex, ModuleTranslation, PrimaryMap};

fn unimplemented_try_table() -> wasm_encoder::Instruction<'static> {
    unimplemented!()
}
pub enum Translation<'a> {
    Normal(ModuleTranslation<'a>),
    Augmented {
        original: ModuleTranslation<'a>,
        wasm: Vec<u8>,
        imports_removed: HashSet<(String, String)>,
        imports_added: Vec<(String, String, MemoryIndex, AugmentedOp)>,
    },
}

pub enum AugmentedImport<'a> {
    CoreDef(&'a CoreDef),
    Memory { mem: &'a CoreDef, op: AugmentedOp },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum AugmentedOp {
    I32Load,
    I32Load8U,
    I32Load8S,
    I32Load16U,
    I32Load16S,
    I64Load,
    F32Load,
    F64Load,
    I32Store,
    I32Store8,
    I32Store16,
    I64Store,
    F32Store,
    F64Store,
    MemorySize,
}

impl<'a> Translation<'a> {
    pub fn new(translation: ModuleTranslation<'a>, multi_memory: bool) -> Result<Translation<'a>> {
        if multi_memory {
            return Ok(Translation::Normal(translation));
        }
        let mut features = WasmFeatures::default();
        features.set(WasmFeatures::MULTI_MEMORY, false);
        match Validator::new_with_features(features).validate_all(translation.wasm) {
            // This module validates without multi-memory, no need to augment
            // it
            Ok(_) => return Ok(Translation::Normal(translation)),
            Err(e) => {
                features.set(WasmFeatures::MULTI_MEMORY, true);
                match Validator::new_with_features(features).validate_all(translation.wasm) {
                    // This module validates with multi-memory, so fall through
                    // to augmentation.
                    Ok(_) => {}

                    // This appears to not validate at all.
                    Err(_) => return Err(e.into()),
                }
            }
        }

        let mut augmenter = Augmenter {
            translation: &translation,
            imports_removed: Default::default(),
            imports_added: Default::default(),
            imported_funcs: Default::default(),
            imported_memories: Default::default(),
            imports: Default::default(),
            exports: Default::default(),
            local_func_tys: Default::default(),
            local_funcs: Default::default(),
            types: Default::default(),
            augments: Default::default(),
        };
        let wasm = augmenter.run()?;
        Ok(Translation::Augmented {
            wasm,
            imports_removed: augmenter.imports_removed,
            imports_added: augmenter.imports_added,
            original: translation,
        })
    }

    /// Returns the encoded wasm that represents this module, automatically
    /// returning the augmented version if multi-memory augmentation was
    /// required.
    pub fn wasm(&self) -> &[u8] {
        match self {
            Translation::Normal(translation) => translation.wasm,
            Translation::Augmented { wasm, .. } => wasm,
        }
    }

    /// Returns an iterator over the imports for this module using the `args` as
    /// supplied to the original module.
    ///
    /// The returned imports are either those within `args` or augmented
    /// versions based on `args` that perform an `AugmentedOp`.
    pub fn imports<'b>(
        &'b self,
        args: &'b [CoreDef],
    ) -> Vec<(&'b str, &'b str, AugmentedImport<'b>)> {
        match self {
            Translation::Normal(translation) => {
                assert_eq!(translation.module.imports().len(), args.len());
                translation
                    .module
                    .imports()
                    .zip(args)
                    .map(|((module, name, _), arg)| (module, name, AugmentedImport::CoreDef(arg)))
                    .collect()
            }
            Translation::Augmented {
                original,
                imports_removed,
                imports_added,
                ..
            } => {
                let mut ret = Vec::new();
                let mut memories: PrimaryMap<MemoryIndex, &'b CoreDef> = PrimaryMap::new();
                for ((module, name, _), arg) in original.module.imports().zip(args) {
                    if imports_removed.contains(&(module.to_string(), name.to_string())) {
                        memories.push(arg);
                    } else {
                        ret.push((module, name, AugmentedImport::CoreDef(arg)));
                    }
                }
                for (module, name, index, op) in imports_added {
                    ret.push((
                        module,
                        name,
                        AugmentedImport::Memory {
                            mem: memories[*index],
                            op: *op,
                        },
                    ));
                }
                ret
            }
        }
    }

    /// Returns the exports of this module, which are not modified by
    /// augmentation.
    pub fn exports(
        &self,
    ) -> &wasmtime_environ::wasmparser::collections::IndexMap<String, EntityIndex> {
        match self {
            Translation::Normal(translation) => &translation.module.exports,
            Translation::Augmented { original, .. } => &original.module.exports,
        }
    }
}

pub struct Augmenter<'a> {
    translation: &'a ModuleTranslation<'a>,
    imports_removed: HashSet<(String, String)>,
    imports_added: Vec<(String, String, MemoryIndex, AugmentedOp)>,
    augments: HashMap<(MemoryIndex, AugmentedOp), u32>,

    types: Vec<wasmparser::FuncType>,
    imports: Vec<Import<'a>>,
    imported_funcs: u32,
    imported_memories: u32,
    exports: Vec<Export<'a>>,
    local_funcs: Vec<FunctionBody<'a>>,
    local_func_tys: Vec<u32>,
}

impl Augmenter<'_> {
    fn run(&mut self) -> Result<Vec<u8>> {
        // The first step is to parse the input original wasm and learn about
        // its structure. This validates that all the sections are supported and
        // records various bits of information about the module within `self`.
        for payload in Parser::new(0).parse_all(self.translation.wasm) {
            match payload? {
                Payload::TypeSection(s) => {
                    for grp in s.into_iter_err_on_gc_types() {
                        self.types.push(grp?);
                    }
                }
                Payload::ImportSection(s) => {
                    for i in s {
                        let i = i?;
                        match i.ty {
                            TypeRef::Func(_) => self.imported_funcs += 1,
                            TypeRef::Memory(_) => {
                                if self.imported_memories > 0 {
                                    let ok = self
                                        .imports_removed
                                        .insert((i.module.to_string(), i.name.to_string()));
                                    assert!(ok);
                                    continue;
                                }
                                self.imported_memories += 1;
                            }
                            _ => {}
                        }
                        self.imports.push(i);
                    }
                }
                Payload::ExportSection(s) => {
                    for e in s {
                        let e = e?;
                        self.exports.push(e);
                    }
                }
                Payload::FunctionSection(s) => {
                    for ty in s {
                        let ty = ty?;
                        self.local_func_tys.push(ty);
                    }
                }
                Payload::CodeSectionEntry(body) => {
                    self.local_funcs.push(body);
                }

                // NB: these sections are theoretically possible to handle but
                // are not required at this time.
                Payload::DataCountSection { .. }
                | Payload::GlobalSection(_)
                | Payload::TableSection(_)
                | Payload::MemorySection(_)
                | Payload::ElementSection(_)
                | Payload::DataSection(_)
                | Payload::StartSection { .. }
                | Payload::TagSection(_)
                | Payload::UnknownSection { .. } => {
                    bail!("unsupported section found in module using multiple memories")
                }

                // component-model related things that shouldn't show up
                Payload::ModuleSection { .. }
                | Payload::ComponentSection { .. }
                | Payload::InstanceSection(_)
                | Payload::ComponentInstanceSection(_)
                | Payload::ComponentAliasSection(_)
                | Payload::ComponentCanonicalSection(_)
                | Payload::ComponentStartSection { .. }
                | Payload::ComponentImportSection(_)
                | Payload::CoreTypeSection(_)
                | Payload::ComponentExportSection(_)
                | Payload::ComponentTypeSection(_) => {
                    bail!("component section found in module using multiple memories")
                }

                _ => {}
            }
        }

        // After the module has been parsed next the set of adapter functions is
        // determined. This is done by parsing all instructions in the module
        // and looking for anything that operates on memory index 1 or greater.
        //
        // This will fill out `self.augments` which is a list of functionality
        // that must be provided by JS to mutate non-index-0 memories.
        for body in self.local_funcs.clone() {
            let mut reader = body.get_operators_reader()?;
            while !reader.eof() {
                reader.visit_operator(&mut CollectMemOps(self))?;
            }
        }

        // And now at the end we've got all the information for encoding so
        // begin that process.
        self.encode()
    }

    fn augment_op(&mut self, mem: u32, op: AugmentedOp) {
        // Memory 0 stays in the module and isn't removed, so no need to
        // register an augmentation.
        if mem == 0 {
            return;
        }
        let index = MemoryIndex::from_u32(mem - 1);
        self.augments.entry((index, op)).or_insert_with(|| {
            let idx = self.imported_funcs + self.imports_added.len() as u32;
            self.imports_added.push((
                "augments".to_string(),
                format!("mem{mem} {op:?}"),
                index,
                op,
            ));
            idx
        });
    }

    fn encode(&self) -> Result<Vec<u8>> {
        let mut module = Module::new();

        // Types are all passed through as-is to retain the same type section as
        // before.
        let mut types = TypeSection::new();
        for ty in &self.types {
            types.ty().function(
                ty.params().iter().map(|v| valtype(*v)),
                ty.results().iter().map(|v| valtype(*v)),
            );
        }

        // Pass through all of `self.imports` into the import section. This will
        // already have imports of multiple memories removed so this will import
        // at most one memory.
        let mut imports = ImportSection::new();
        for import in self.imports.iter() {
            let ty = match import.ty {
                TypeRef::Func(f) => EntityType::Function(f),
                TypeRef::Global(g) => EntityType::Global(wasm_encoder::GlobalType {
                    mutable: g.mutable,
                    val_type: valtype(g.content_type),
                    shared: g.shared,
                }),
                TypeRef::Memory(m) => EntityType::Memory(wasm_encoder::MemoryType {
                    maximum: m.maximum,
                    minimum: m.initial,
                    memory64: m.memory64,
                    shared: m.shared,
                    page_size_log2: m.page_size_log2,
                }),
                TypeRef::Table(_) => unimplemented!(),
                TypeRef::Tag(_) => unimplemented!(),
            };
            imports.import(import.module, import.name, ty);
        }

        // After the normal imports are all registered next the
        // memory-modification-functions are all imported. This is a new
        // addition to this module which shifts all functions in the index
        // space, hence the rewriting of all function bodies below.
        //
        // Each augmentation function declares its type signature in the type
        // section at the end of the type section to avoid tampering with the
        // type section's original index spaces. It would be more efficient to
        // not redeclare function signatures and reuse existing function
        // signatures, but that's left as an optimization for a later date.
        for (module, name, _, op) in self.imports_added.iter() {
            let cnt = types.len();
            op.encode_type(&mut types);
            imports.import(module, name, EntityType::Function(cnt));
        }

        // The function section remains the same as we're not tampering with the
        // count or types of all local functions.
        let mut funcs = FunctionSection::new();
        for ty in self.local_func_tys.iter() {
            funcs.function(*ty);
        }

        // Exports all remain the same with the one caveat that the function
        // index space has changed so those indices are remapped.
        let mut exports = ExportSection::new();
        for e in self.exports.iter() {
            let (kind, index) = match e.kind {
                ExternalKind::Func => (ExportKind::Func, self.remap_func(e.index)),
                ExternalKind::Table => (ExportKind::Table, e.index),
                ExternalKind::Global => (ExportKind::Global, e.index),
                ExternalKind::Memory => {
                    assert!(e.index < 1);
                    (ExportKind::Memory, e.index)
                }
                ExternalKind::Tag => (ExportKind::Tag, e.index),
            };
            exports.export(e.name, kind, index);
        }

        // Finally the code section is remapped. This is done by translating
        // operator-by-operator from `wasmparser` to `wasm-encoder`. This
        // is where instructions like `i32.load 1` will become `call
        // $i32_load_memory_1`.
        let mut code = CodeSection::new();
        for body in self.local_funcs.iter() {
            let mut locals = Vec::new();

            for local in body.get_locals_reader()? {
                let (cnt, ty) = local?;
                locals.push((cnt, valtype(ty)));
            }

            let mut f = Function::new(locals);

            let mut ops = body.get_operators_reader()?;
            while !ops.eof() {
                ops.visit_operator(&mut Translator {
                    func: &mut f,
                    augmenter: self,
                })?;
            }

            code.function(&f);
        }

        module.section(&types);
        module.section(&imports);
        module.section(&funcs);
        module.section(&exports);
        module.section(&code);

        Ok(module.finish())
    }

    fn remap_func(&self, index: u32) -> u32 {
        if index < self.imported_funcs {
            index
        } else {
            index + self.imports_added.len() as u32
        }
    }

    fn remap_memory(&self, index: u32) -> u32 {
        assert!(index < 1);
        index
    }
}

fn valtype(ty: wasmparser::ValType) -> wasm_encoder::ValType {
    match ty {
        wasmparser::ValType::I32 => wasm_encoder::ValType::I32,
        wasmparser::ValType::I64 => wasm_encoder::ValType::I64,
        wasmparser::ValType::F32 => wasm_encoder::ValType::F32,
        wasmparser::ValType::F64 => wasm_encoder::ValType::F64,
        wasmparser::ValType::V128 => wasm_encoder::ValType::V128,
        wasmparser::ValType::Ref(_) => unimplemented!(),
    }
}

struct CollectMemOps<'a, 'b>(&'a mut Augmenter<'b>);

macro_rules! define_visit {
    ($( @$proposal:ident $op:ident $({ $($arg:ident: $argty:ty),* })? => $visit:ident ($($ann:tt)*))*) => {
        $(
            #[allow(unreachable_code)]
            fn $visit(&mut self $( $( ,$arg: $argty)* )?) {
                define_visit!(augment self $op $($($arg)*)?);
            }
        )*
    };

    // List of instructions that are augmented which register the memory index
    // and the relevant augmentation operation.
    (augment $self:ident I32Load $memarg:ident) => {
        $self.0.augment_op($memarg.memory, AugmentedOp::I32Load);
    };
    (augment $self:ident I64Load $memarg:ident) => {
        $self.0.augment_op($memarg.memory, AugmentedOp::I64Load);
    };
    (augment $self:ident F32Load $memarg:ident) => {
        $self.0.augment_op($memarg.memory, AugmentedOp::F32Load);
    };
    (augment $self:ident F64Load $memarg:ident) => {
        $self.0.augment_op($memarg.memory, AugmentedOp::F64Load);
    };
    (augment $self:ident I32Load8U $memarg:ident) => {
        $self.0.augment_op($memarg.memory, AugmentedOp::I32Load8U);
    };
    (augment $self:ident I32Load8S $memarg:ident) => {
        $self.0.augment_op($memarg.memory, AugmentedOp::I32Load8S);
    };
    (augment $self:ident I32Load16U $memarg:ident) => {
        $self.0.augment_op($memarg.memory, AugmentedOp::I32Load16U);
    };
    (augment $self:ident I32Load16S $memarg:ident) => {
        $self.0.augment_op($memarg.memory, AugmentedOp::I32Load16S);
    };
    (augment $self:ident I32Store $memarg:ident) => {
        $self.0.augment_op($memarg.memory, AugmentedOp::I32Store);
    };
    (augment $self:ident I64Store $memarg:ident) => {
        $self.0.augment_op($memarg.memory, AugmentedOp::I64Store);
    };
    (augment $self:ident F32Store $memarg:ident) => {
        $self.0.augment_op($memarg.memory, AugmentedOp::F32Store);
    };
    (augment $self:ident F64Store $memarg:ident) => {
        $self.0.augment_op($memarg.memory, AugmentedOp::F64Store);
    };
    (augment $self:ident I32Store8 $memarg:ident) => {
        $self.0.augment_op($memarg.memory, AugmentedOp::I32Store8);
    };
    (augment $self:ident I32Store16 $memarg:ident) => {
        $self.0.augment_op($memarg.memory, AugmentedOp::I32Store16);
    };

    (augment $self:ident MemorySize $mem:ident) => {
        $self.0.augment_op($mem, AugmentedOp::MemorySize);
    };

    // Catch-all which asserts that none of the `$arg` looks like a memory
    // index ty catch any missing instructions from the list above.
    (augment $self:ident $op:ident $($arg:ident)*) => {
        $(
            define_visit!(assert_not_mem $op $arg);
        )*
    };

    (assert_not_mem $op:ident mem) => {panic!(concat!("missed case ", stringify!($op)));};
    (assert_not_mem $op:ident src_mem) => {panic!(concat!("missed case ", stringify!($op)));};
    (assert_not_mem $op:ident dst_mem) => {panic!(concat!("missed case ", stringify!($op)));};
    (assert_not_mem $op:ident memarg) => {panic!(concat!("missed case ", stringify!($op)));};
    (assert_not_mem $op:ident $other:ident) => {};
}

impl<'a> VisitOperator<'a> for CollectMemOps<'_, 'a> {
    type Output = ();

    wasmparser::for_each_operator!(define_visit);
}

impl AugmentedOp {
    fn encode_type(&self, section: &mut TypeSection) {
        use wasm_encoder::ValType::*;
        match self {
            // Loads take two arguments: the first is the address being loaded
            // from and the second is the static offset that was listed on the
            // relevant load instruction.
            AugmentedOp::I32Load
            | AugmentedOp::I32Load8U
            | AugmentedOp::I32Load8S
            | AugmentedOp::I32Load16U
            | AugmentedOp::I32Load16S => {
                section.ty().function([I32, I32], [I32]);
            }
            AugmentedOp::I64Load => {
                section.ty().function([I32, I32], [I64]);
            }
            AugmentedOp::F32Load => {
                section.ty().function([I32, I32], [F32]);
            }
            AugmentedOp::F64Load => {
                section.ty().function([I32, I32], [F64]);
            }

            // Stores, like loads, take an additional argument than usual which
            // is the static offset on the store instruction.
            AugmentedOp::I32Store | AugmentedOp::I32Store8 | AugmentedOp::I32Store16 => {
                section.ty().function([I32, I32, I32], []);
            }
            AugmentedOp::I64Store => {
                section.ty().function([I32, I64, I32], []);
            }
            AugmentedOp::F32Store => {
                section.ty().function([I32, F32, I32], []);
            }
            AugmentedOp::F64Store => {
                section.ty().function([I32, F64, I32], []);
            }

            AugmentedOp::MemorySize => {
                section.ty().function([], [I32]);
            }
        }
    }
}

struct Translator<'a, 'b> {
    func: &'a mut wasm_encoder::Function,
    augmenter: &'a Augmenter<'b>,
}

// Helper macro to create a wasmparser visitor which will translate each
// individual instruction from wasmparser to wasm-encoder.
macro_rules! define_translate {
    // This is the base case where all methods are defined and the body of each
    // method delegates to a recursive invocation of this macro to hit one of
    // the cases below.
    ($( @$proposal:ident $op:ident $({ $($arg:ident: $argty:ty),* })? => $visit:ident ($($ann:tt)*))*) => {
        $(
            #[allow(unreachable_code)]
            #[allow(dropping_copy_types)]
            fn $visit(&mut self $(, $($arg: $argty),*)?)  {
                #[allow(unused_imports)]
                use wasm_encoder::Instruction::*;

                define_translate!(translate self $op $($($arg)*)?)
            }
        )*
    };

    // Memory-related operations are translated to augmentations which are a
    // `Call` of an imported function (or are passed through natively as the
    // same instruction if they use memory 0).
    (translate $self:ident I32Load $memarg:ident) => {{
        $self.augment(AugmentedOp::I32Load, I32Load, $memarg)
    }};
    (translate $self:ident I32Load8U $memarg:ident) => {{
        $self.augment(AugmentedOp::I32Load8U, I32Load8U, $memarg)
    }};
    (translate $self:ident I32Load8S $memarg:ident) => {{
        $self.augment(AugmentedOp::I32Load8S, I32Load8S, $memarg)
    }};
    (translate $self:ident I32Load16U $memarg:ident) => {{
        $self.augment(AugmentedOp::I32Load16U, I32Load16U, $memarg)
    }};
    (translate $self:ident I32Load16S $memarg:ident) => {{
        $self.augment(AugmentedOp::I32Load16S, I32Load16S, $memarg)
    }};
    (translate $self:ident I64Load $memarg:ident) => {{
        $self.augment(AugmentedOp::I64Load, I64Load, $memarg)
    }};
    (translate $self:ident F32Load $memarg:ident) => {{
        $self.augment(AugmentedOp::F32Load, F32Load, $memarg)
    }};
    (translate $self:ident F64Load $memarg:ident) => {{
        $self.augment(AugmentedOp::F64Load, F64Load, $memarg)
    }};
    (translate $self:ident I32Store $memarg:ident) => {{
        $self.augment(AugmentedOp::I32Store, I32Store, $memarg)
    }};
    (translate $self:ident I32Store8 $memarg:ident) => {{
        $self.augment(AugmentedOp::I32Store8, I32Store8, $memarg)
    }};
    (translate $self:ident I32Store16 $memarg:ident) => {{
        $self.augment(AugmentedOp::I32Store16, I32Store16, $memarg)
    }};
    (translate $self:ident I64Store $memarg:ident) => {{
        $self.augment(AugmentedOp::I64Store, I64Store, $memarg)
    }};
    (translate $self:ident F32Store $memarg:ident) => {{
        $self.augment(AugmentedOp::F32Store, F32Store, $memarg)
    }};
    (translate $self:ident F64Store $memarg:ident) => {{
        $self.augment(AugmentedOp::F64Store, F64Store, $memarg)
    }};
    (translate $self:ident MemorySize $mem:ident) => {{
        if $mem < 1 {
            $self.func.instruction(&MemorySize($mem));
        } else {
            let mem = MemoryIndex::from_u32($mem - 1);
            let func = $self.augmenter.augments[&(mem, AugmentedOp::MemorySize)];
            $self.func.instruction(&Call(func));
        }
    }};

    // All other instructions not listed above are caught here and fall through
    // to below cases to translate arguments/types from wasmparser to
    // wasm-encoder and then create the new instruction.
    (translate $self:ident $op:ident $($arg:ident)*) => {{
        $(
            let $arg = define_translate!(map $self $arg $arg);
        )*
        let insn = define_translate!(mk $op $($arg)*);
        $self.func.instruction(&insn);
    }};

    // No-payload instructions are named the same in wasmparser as they are in
    // wasm-encoder
    (mk $op:ident) => ($op);

    // Instructions which need "special care" to map from wasmparser to
    // wasm-encoder
    (mk BrTable $arg:ident) => ({
        BrTable($arg.0, $arg.1)
    });
    (mk CallIndirect $ty:ident $table:ident $table_byte:ident) => ({
        let _ = $table_byte;
        CallIndirect { ty: $ty, table: $table }
    });
    (mk ReturnCallIndirect $ty:ident $table:ident) => (
        ReturnCallIndirect { type_index: $ty, table_index: $table }
    );
    (mk I32Const $v:ident) => (I32Const($v));
    (mk I64Const $v:ident) => (I64Const($v));
    (mk F32Const $v:ident) => (F32Const(f32::from_bits($v.bits())));
    (mk F64Const $v:ident) => (F64Const(f64::from_bits($v.bits())));
    (mk V128Const $v:ident) => (V128Const($v.i128()));
    (mk TryTable $v:ident) => (unimplemented_try_table());
    (mk MemoryGrow $($x:tt)*) => ({
        if true { unimplemented!() } Nop
    });

    // Catch-all for the translation of one payload argument which is typically
    // represented as a tuple-enum in wasm-encoder.
    (mk $op:ident $arg:ident) => ($op($arg));

    // Catch-all of everything else where the wasmparser fields are simply
    // translated to wasm-encoder fields.
    (mk $op:ident $($arg:ident)*) => ($op { $($arg),* });

    // Individual cases of mapping one argument type to another, similar to the
    // `define_visit` macro above.
    (map $self:ident $arg:ident memarg) => {$self.memarg($arg)};
    (map $self:ident $arg:ident ordering) => {$self.ordering($arg)};
    (map $self:ident $arg:ident blockty) => {$self.blockty($arg)};
    (map $self:ident $arg:ident hty) => {$self.heapty($arg)};
    (map $self:ident $arg:ident tag_index) => {$arg};
    (map $self:ident $arg:ident relative_depth) => {$arg};
    (map $self:ident $arg:ident function_index) => {$self.augmenter.remap_func($arg)};
    (map $self:ident $arg:ident global_index) => {$arg};
    (map $self:ident $arg:ident mem) => {$self.augmenter.remap_memory($arg)};
    (map $self:ident $arg:ident src_mem) => {$self.augmenter.remap_memory($arg)};
    (map $self:ident $arg:ident dst_mem) => {$self.augmenter.remap_memory($arg)};
    (map $self:ident $arg:ident table) => {$arg};
    (map $self:ident $arg:ident table_index) => {$arg};
    (map $self:ident $arg:ident src_table) => {$arg};
    (map $self:ident $arg:ident dst_table) => {$arg};
    (map $self:ident $arg:ident type_index) => {$arg};
    (map $self:ident $arg:ident ty) => {valtype($arg)};
    (map $self:ident $arg:ident local_index) => {$arg};
    (map $self:ident $arg:ident lane) => {$arg};
    (map $self:ident $arg:ident lanes) => {$arg};
    (map $self:ident $arg:ident elem_index) => {$arg};
    (map $self:ident $arg:ident data_index) => {$arg};
    (map $self:ident $arg:ident table_byte) => {$arg};
    (map $self:ident $arg:ident mem_byte) => {$arg};
    (map $self:ident $arg:ident value) => {$arg};
    (map $self:ident $arg:ident targets) => ((
        $arg.targets().map(|i| i.unwrap()).collect::<Vec<_>>().into(),
        $arg.default(),
    ));
    (map $self:ident $arg:ident try_table) => {$arg};
    (map $self:ident $arg:ident struct_type_index) => {$self.remap(Item::Type, $arg).unwrap()};
    (map $self:ident $arg:ident field_index) => {$arg};
    (map $self:ident $arg:ident array_type_index) => {$self.remap(Item::Type, $arg).unwrap()};
    (map $self:ident $arg:ident array_size) => {$arg};
    (map $self:ident $arg:ident array_data_index) => ($self.remap(Item::Data, $arg).unwrap());
    (map $self:ident $arg:ident array_elem_index) => ($self.remap(Item::Element, $arg).unwrap());
    (map $self:ident $arg:ident array_type_index_dst) => ($self.remap(Item::Type, $arg).unwrap());
    (map $self:ident $arg:ident array_type_index_src) => ($self.remap(Item::Type, $arg).unwrap());
    (map $self:ident $arg:ident from_ref_type) => ($self.refty(&$arg).unwrap());
    (map $self:ident $arg:ident to_ref_type) => ($self.refty(&$arg).unwrap());
    (map $self:ident $arg:ident cont_type_index) => ($self.remap(Item::Type, $arg).unwrap());
    (map $self:ident $arg:ident argument_index) => ($self.remap(Item::Type, $arg).unwrap());
    (map $self:ident $arg:ident result_index) => ($self.remap(Item::Type, $arg).unwrap());
    (map $self:ident $arg:ident resume_table) => ((
        unimplemented!()
    ));
}

impl<'a> VisitOperator<'a> for Translator<'_, 'a> {
    type Output = ();

    wasmparser::for_each_operator!(define_translate);
}

#[derive(Debug, Hash, Eq, PartialEq, Copy, Clone)]
pub enum Item {
    // Function,
    // Table,
    // Memory,
    // Tag,
    // Global,
    Type,
    Data,
    Element,
}

impl Translator<'_, '_> {
    fn remap(&mut self, item: Item, idx: u32) -> Result<u32> {
        let _ = item;
        Ok(idx)
    }
    fn refty(&mut self, _ty: &wasmparser::RefType) -> Result<wasm_encoder::RefType> {
        unimplemented!()
    }
    fn blockty(&self, ty: wasmparser::BlockType) -> wasm_encoder::BlockType {
        match ty {
            wasmparser::BlockType::Empty => wasm_encoder::BlockType::Empty,
            wasmparser::BlockType::Type(t) => wasm_encoder::BlockType::Result(valtype(t)),
            wasmparser::BlockType::FuncType(i) => wasm_encoder::BlockType::FunctionType(i),
        }
    }
    fn heapty(&self, _ty: wasmparser::HeapType) -> wasm_encoder::HeapType {
        unimplemented!()
    }

    fn memarg(&self, ty: wasmparser::MemArg) -> wasm_encoder::MemArg {
        wasm_encoder::MemArg {
            align: ty.align.into(),
            offset: ty.offset,
            memory_index: self.augmenter.remap_memory(ty.memory),
        }
    }

    fn ordering(&self, ty: wasmparser::Ordering) -> wasm_encoder::Ordering {
        match ty {
            wasmparser::Ordering::AcqRel => wasm_encoder::Ordering::AcqRel,
            wasmparser::Ordering::SeqCst => wasm_encoder::Ordering::SeqCst,
        }
    }

    fn augment(
        &mut self,
        op: AugmentedOp,
        insn: fn(wasm_encoder::MemArg) -> wasm_encoder::Instruction<'static>,
        memarg: wasmparser::MemArg,
    ) {
        use wasm_encoder::Instruction::*;
        if memarg.memory < 1 {
            self.func.instruction(&insn(self.memarg(memarg)));
            return;
        }
        let idx = MemoryIndex::from_u32(memarg.memory - 1);
        let func = self.augmenter.augments[&(idx, op)];
        self.func.instruction(&I32Const(memarg.offset as i32));
        self.func.instruction(&Call(func));
    }
}
