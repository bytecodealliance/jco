pub type Files = _rt::Vec<(_rt::String, _rt::Vec<u8>)>;
pub type Maps = _rt::Vec<(_rt::String, _rt::String)>;
#[derive(Clone, Copy)]
pub enum InstantiationMode {
    Async,
    Sync,
}
impl ::core::fmt::Debug for InstantiationMode {
    fn fmt(&self, f: &mut ::core::fmt::Formatter<'_>) -> ::core::fmt::Result {
        match self {
            InstantiationMode::Async => {
                f.debug_tuple("InstantiationMode::Async").finish()
            }
            InstantiationMode::Sync => f.debug_tuple("InstantiationMode::Sync").finish(),
        }
    }
}
#[derive(Clone, Copy)]
pub enum BindingsMode {
    Js,
    Hybrid,
    Optimized,
    DirectOptimized,
}
impl ::core::fmt::Debug for BindingsMode {
    fn fmt(&self, f: &mut ::core::fmt::Formatter<'_>) -> ::core::fmt::Result {
        match self {
            BindingsMode::Js => f.debug_tuple("BindingsMode::Js").finish(),
            BindingsMode::Hybrid => f.debug_tuple("BindingsMode::Hybrid").finish(),
            BindingsMode::Optimized => f.debug_tuple("BindingsMode::Optimized").finish(),
            BindingsMode::DirectOptimized => {
                f.debug_tuple("BindingsMode::DirectOptimized").finish()
            }
        }
    }
}
#[derive(Clone)]
pub struct GenerateOptions {
    /// Name to use for the generated component
    pub name: _rt::String,
    /// Disables generation of `*.d.ts` files and instead only generates `*.js`
    /// source files.
    pub no_typescript: Option<bool>,
    /// Provide a custom JS instantiation API for the component instead
    /// of the direct importable native ESM output.
    pub instantiation: Option<InstantiationMode>,
    /// Import bindings generation mode
    pub import_bindings: Option<BindingsMode>,
    /// Mappings of component import specifiers to JS import specifiers.
    pub map: Option<Maps>,
    /// Enables all compat flags: --tla-compat.
    pub compat: Option<bool>,
    /// Disables compatibility in Node.js without a fetch global.
    pub no_nodejs_compat: Option<bool>,
    /// Set the cutoff byte size for base64 inlining core Wasm in instantiation mode
    /// (set to 0 to disable all base64 inlining)
    pub base64_cutoff: Option<u32>,
    /// Enables compatibility for JS environments without top-level await support
    /// via an async $init promise export to wait for instead.
    pub tla_compat: Option<bool>,
    /// Disable verification of component Wasm data structures when
    /// lifting as a production optimization
    pub valid_lifting_optimization: Option<bool>,
    /// Whether or not to emit `tracing` calls on function entry/exit.
    pub tracing: Option<bool>,
    /// Whether to generate namespaced exports like `foo as "local:package/foo"`.
    /// These exports can break typescript builds.
    pub no_namespaced_exports: Option<bool>,
    /// Whether to output core Wasm utilizing multi-memory or to polyfill
    /// this handling.
    pub multi_memory: Option<bool>,
}
impl ::core::fmt::Debug for GenerateOptions {
    fn fmt(&self, f: &mut ::core::fmt::Formatter<'_>) -> ::core::fmt::Result {
        f.debug_struct("GenerateOptions")
            .field("name", &self.name)
            .field("no-typescript", &self.no_typescript)
            .field("instantiation", &self.instantiation)
            .field("import-bindings", &self.import_bindings)
            .field("map", &self.map)
            .field("compat", &self.compat)
            .field("no-nodejs-compat", &self.no_nodejs_compat)
            .field("base64-cutoff", &self.base64_cutoff)
            .field("tla-compat", &self.tla_compat)
            .field("valid-lifting-optimization", &self.valid_lifting_optimization)
            .field("tracing", &self.tracing)
            .field("no-namespaced-exports", &self.no_namespaced_exports)
            .field("multi-memory", &self.multi_memory)
            .finish()
    }
}
#[derive(Clone)]
pub enum Wit {
    /// wit is provided as an inline WIT string
    Source(_rt::String),
    /// wit is provided from a component binary
    Binary(_rt::Vec<u8>),
    /// wit is provided from a filesystem path
    Path(_rt::String),
}
impl ::core::fmt::Debug for Wit {
    fn fmt(&self, f: &mut ::core::fmt::Formatter<'_>) -> ::core::fmt::Result {
        match self {
            Wit::Source(e) => f.debug_tuple("Wit::Source").field(e).finish(),
            Wit::Binary(e) => f.debug_tuple("Wit::Binary").field(e).finish(),
            Wit::Path(e) => f.debug_tuple("Wit::Path").field(e).finish(),
        }
    }
}
/// Enumerate enabled features
#[derive(Clone)]
pub enum EnabledFeatureSet {
    /// Enable only the given list of features
    List(_rt::Vec<_rt::String>),
    /// Enable all features
    All,
}
impl ::core::fmt::Debug for EnabledFeatureSet {
    fn fmt(&self, f: &mut ::core::fmt::Formatter<'_>) -> ::core::fmt::Result {
        match self {
            EnabledFeatureSet::List(e) => {
                f.debug_tuple("EnabledFeatureSet::List").field(e).finish()
            }
            EnabledFeatureSet::All => f.debug_tuple("EnabledFeatureSet::All").finish(),
        }
    }
}
#[derive(Clone)]
pub struct TypeGenerationOptions {
    /// wit to generate typing from
    pub wit: Wit,
    /// world to generate typing for
    pub world: Option<_rt::String>,
    pub tla_compat: Option<bool>,
    pub instantiation: Option<InstantiationMode>,
    pub map: Option<Maps>,
    /// Features that should be enabled as part of feature gating
    pub features: Option<EnabledFeatureSet>,
}
impl ::core::fmt::Debug for TypeGenerationOptions {
    fn fmt(&self, f: &mut ::core::fmt::Formatter<'_>) -> ::core::fmt::Result {
        f.debug_struct("TypeGenerationOptions")
            .field("wit", &self.wit)
            .field("world", &self.world)
            .field("tla-compat", &self.tla_compat)
            .field("instantiation", &self.instantiation)
            .field("map", &self.map)
            .field("features", &self.features)
            .finish()
    }
}
#[repr(u8)]
#[derive(Clone, Copy, Eq, PartialEq)]
pub enum ExportType {
    Function,
    Instance,
}
impl ::core::fmt::Debug for ExportType {
    fn fmt(&self, f: &mut ::core::fmt::Formatter<'_>) -> ::core::fmt::Result {
        match self {
            ExportType::Function => f.debug_tuple("ExportType::Function").finish(),
            ExportType::Instance => f.debug_tuple("ExportType::Instance").finish(),
        }
    }
}
impl ExportType {
    #[doc(hidden)]
    pub unsafe fn _lift(val: u8) -> ExportType {
        if !cfg!(debug_assertions) {
            return ::core::mem::transmute(val);
        }
        match val {
            0 => ExportType::Function,
            1 => ExportType::Instance,
            _ => panic!("invalid enum discriminant"),
        }
    }
}
#[derive(Clone)]
pub struct Transpiled {
    pub files: Files,
    pub imports: _rt::Vec<_rt::String>,
    pub exports: _rt::Vec<(_rt::String, ExportType)>,
}
impl ::core::fmt::Debug for Transpiled {
    fn fmt(&self, f: &mut ::core::fmt::Formatter<'_>) -> ::core::fmt::Result {
        f.debug_struct("Transpiled")
            .field("files", &self.files)
            .field("imports", &self.imports)
            .field("exports", &self.exports)
            .finish()
    }
}
#[doc(hidden)]
#[allow(non_snake_case)]
pub unsafe fn _export_generate_cabi<T: Guest>(arg0: *mut u8) -> *mut u8 {
    #[cfg(target_arch = "wasm32")] _rt::run_ctors_once();
    let l0 = *arg0.add(0).cast::<*mut u8>();
    let l1 = *arg0.add(4).cast::<usize>();
    let len2 = l1;
    let l3 = *arg0.add(8).cast::<*mut u8>();
    let l4 = *arg0.add(12).cast::<usize>();
    let len5 = l4;
    let bytes5 = _rt::Vec::from_raw_parts(l3.cast(), len5, len5);
    let l6 = i32::from(*arg0.add(16).cast::<u8>());
    let l8 = i32::from(*arg0.add(18).cast::<u8>());
    let l11 = i32::from(*arg0.add(20).cast::<u8>());
    let l14 = i32::from(*arg0.add(24).cast::<u8>());
    let l24 = i32::from(*arg0.add(36).cast::<u8>());
    let l26 = i32::from(*arg0.add(38).cast::<u8>());
    let l28 = i32::from(*arg0.add(40).cast::<u8>());
    let l30 = i32::from(*arg0.add(48).cast::<u8>());
    let l32 = i32::from(*arg0.add(50).cast::<u8>());
    let l34 = i32::from(*arg0.add(52).cast::<u8>());
    let l36 = i32::from(*arg0.add(54).cast::<u8>());
    let l38 = i32::from(*arg0.add(56).cast::<u8>());
    let result40 = T::generate(
        _rt::Vec::from_raw_parts(l0.cast(), len2, len2),
        GenerateOptions {
            name: _rt::string_lift(bytes5),
            no_typescript: match l6 {
                0 => None,
                1 => {
                    let e = {
                        let l7 = i32::from(*arg0.add(17).cast::<u8>());
                        _rt::bool_lift(l7 as u8)
                    };
                    Some(e)
                }
                _ => _rt::invalid_enum_discriminant(),
            },
            instantiation: match l8 {
                0 => None,
                1 => {
                    let e = {
                        let l9 = i32::from(*arg0.add(19).cast::<u8>());
                        let v10 = match l9 {
                            0 => InstantiationMode::Async,
                            n => {
                                debug_assert_eq!(n, 1, "invalid enum discriminant");
                                InstantiationMode::Sync
                            }
                        };
                        v10
                    };
                    Some(e)
                }
                _ => _rt::invalid_enum_discriminant(),
            },
            import_bindings: match l11 {
                0 => None,
                1 => {
                    let e = {
                        let l12 = i32::from(*arg0.add(21).cast::<u8>());
                        let v13 = match l12 {
                            0 => BindingsMode::Js,
                            1 => BindingsMode::Hybrid,
                            2 => BindingsMode::Optimized,
                            n => {
                                debug_assert_eq!(n, 3, "invalid enum discriminant");
                                BindingsMode::DirectOptimized
                            }
                        };
                        v13
                    };
                    Some(e)
                }
                _ => _rt::invalid_enum_discriminant(),
            },
            map: match l14 {
                0 => None,
                1 => {
                    let e = {
                        let l15 = *arg0.add(28).cast::<*mut u8>();
                        let l16 = *arg0.add(32).cast::<usize>();
                        let base23 = l15;
                        let len23 = l16;
                        let mut result23 = _rt::Vec::with_capacity(len23);
                        for i in 0..len23 {
                            let base = base23.add(i * 16);
                            let e23 = {
                                let l17 = *base.add(0).cast::<*mut u8>();
                                let l18 = *base.add(4).cast::<usize>();
                                let len19 = l18;
                                let bytes19 = _rt::Vec::from_raw_parts(
                                    l17.cast(),
                                    len19,
                                    len19,
                                );
                                let l20 = *base.add(8).cast::<*mut u8>();
                                let l21 = *base.add(12).cast::<usize>();
                                let len22 = l21;
                                let bytes22 = _rt::Vec::from_raw_parts(
                                    l20.cast(),
                                    len22,
                                    len22,
                                );
                                (_rt::string_lift(bytes19), _rt::string_lift(bytes22))
                            };
                            result23.push(e23);
                        }
                        _rt::cabi_dealloc(base23, len23 * 16, 4);
                        result23
                    };
                    Some(e)
                }
                _ => _rt::invalid_enum_discriminant(),
            },
            compat: match l24 {
                0 => None,
                1 => {
                    let e = {
                        let l25 = i32::from(*arg0.add(37).cast::<u8>());
                        _rt::bool_lift(l25 as u8)
                    };
                    Some(e)
                }
                _ => _rt::invalid_enum_discriminant(),
            },
            no_nodejs_compat: match l26 {
                0 => None,
                1 => {
                    let e = {
                        let l27 = i32::from(*arg0.add(39).cast::<u8>());
                        _rt::bool_lift(l27 as u8)
                    };
                    Some(e)
                }
                _ => _rt::invalid_enum_discriminant(),
            },
            base64_cutoff: match l28 {
                0 => None,
                1 => {
                    let e = {
                        let l29 = *arg0.add(44).cast::<i32>();
                        l29 as u32
                    };
                    Some(e)
                }
                _ => _rt::invalid_enum_discriminant(),
            },
            tla_compat: match l30 {
                0 => None,
                1 => {
                    let e = {
                        let l31 = i32::from(*arg0.add(49).cast::<u8>());
                        _rt::bool_lift(l31 as u8)
                    };
                    Some(e)
                }
                _ => _rt::invalid_enum_discriminant(),
            },
            valid_lifting_optimization: match l32 {
                0 => None,
                1 => {
                    let e = {
                        let l33 = i32::from(*arg0.add(51).cast::<u8>());
                        _rt::bool_lift(l33 as u8)
                    };
                    Some(e)
                }
                _ => _rt::invalid_enum_discriminant(),
            },
            tracing: match l34 {
                0 => None,
                1 => {
                    let e = {
                        let l35 = i32::from(*arg0.add(53).cast::<u8>());
                        _rt::bool_lift(l35 as u8)
                    };
                    Some(e)
                }
                _ => _rt::invalid_enum_discriminant(),
            },
            no_namespaced_exports: match l36 {
                0 => None,
                1 => {
                    let e = {
                        let l37 = i32::from(*arg0.add(55).cast::<u8>());
                        _rt::bool_lift(l37 as u8)
                    };
                    Some(e)
                }
                _ => _rt::invalid_enum_discriminant(),
            },
            multi_memory: match l38 {
                0 => None,
                1 => {
                    let e = {
                        let l39 = i32::from(*arg0.add(57).cast::<u8>());
                        _rt::bool_lift(l39 as u8)
                    };
                    Some(e)
                }
                _ => _rt::invalid_enum_discriminant(),
            },
        },
    );
    _rt::cabi_dealloc(arg0, 60, 4);
    let ptr41 = _RET_AREA.0.as_mut_ptr().cast::<u8>();
    match result40 {
        Ok(e) => {
            *ptr41.add(0).cast::<u8>() = (0i32) as u8;
            let Transpiled { files: files42, imports: imports42, exports: exports42 } = e;
            let vec46 = files42;
            let len46 = vec46.len();
            let layout46 = _rt::alloc::Layout::from_size_align_unchecked(
                vec46.len() * 16,
                4,
            );
            let result46 = if layout46.size() != 0 {
                let ptr = _rt::alloc::alloc(layout46).cast::<u8>();
                if ptr.is_null() {
                    _rt::alloc::handle_alloc_error(layout46);
                }
                ptr
            } else {
                { ::core::ptr::null_mut() }
            };
            for (i, e) in vec46.into_iter().enumerate() {
                let base = result46.add(i * 16);
                {
                    let (t43_0, t43_1) = e;
                    let vec44 = (t43_0.into_bytes()).into_boxed_slice();
                    let ptr44 = vec44.as_ptr().cast::<u8>();
                    let len44 = vec44.len();
                    ::core::mem::forget(vec44);
                    *base.add(4).cast::<usize>() = len44;
                    *base.add(0).cast::<*mut u8>() = ptr44.cast_mut();
                    let vec45 = (t43_1).into_boxed_slice();
                    let ptr45 = vec45.as_ptr().cast::<u8>();
                    let len45 = vec45.len();
                    ::core::mem::forget(vec45);
                    *base.add(12).cast::<usize>() = len45;
                    *base.add(8).cast::<*mut u8>() = ptr45.cast_mut();
                }
            }
            *ptr41.add(8).cast::<usize>() = len46;
            *ptr41.add(4).cast::<*mut u8>() = result46;
            let vec48 = imports42;
            let len48 = vec48.len();
            let layout48 = _rt::alloc::Layout::from_size_align_unchecked(
                vec48.len() * 8,
                4,
            );
            let result48 = if layout48.size() != 0 {
                let ptr = _rt::alloc::alloc(layout48).cast::<u8>();
                if ptr.is_null() {
                    _rt::alloc::handle_alloc_error(layout48);
                }
                ptr
            } else {
                { ::core::ptr::null_mut() }
            };
            for (i, e) in vec48.into_iter().enumerate() {
                let base = result48.add(i * 8);
                {
                    let vec47 = (e.into_bytes()).into_boxed_slice();
                    let ptr47 = vec47.as_ptr().cast::<u8>();
                    let len47 = vec47.len();
                    ::core::mem::forget(vec47);
                    *base.add(4).cast::<usize>() = len47;
                    *base.add(0).cast::<*mut u8>() = ptr47.cast_mut();
                }
            }
            *ptr41.add(16).cast::<usize>() = len48;
            *ptr41.add(12).cast::<*mut u8>() = result48;
            let vec51 = exports42;
            let len51 = vec51.len();
            let layout51 = _rt::alloc::Layout::from_size_align_unchecked(
                vec51.len() * 12,
                4,
            );
            let result51 = if layout51.size() != 0 {
                let ptr = _rt::alloc::alloc(layout51).cast::<u8>();
                if ptr.is_null() {
                    _rt::alloc::handle_alloc_error(layout51);
                }
                ptr
            } else {
                { ::core::ptr::null_mut() }
            };
            for (i, e) in vec51.into_iter().enumerate() {
                let base = result51.add(i * 12);
                {
                    let (t49_0, t49_1) = e;
                    let vec50 = (t49_0.into_bytes()).into_boxed_slice();
                    let ptr50 = vec50.as_ptr().cast::<u8>();
                    let len50 = vec50.len();
                    ::core::mem::forget(vec50);
                    *base.add(4).cast::<usize>() = len50;
                    *base.add(0).cast::<*mut u8>() = ptr50.cast_mut();
                    *base.add(8).cast::<u8>() = (t49_1.clone() as i32) as u8;
                }
            }
            *ptr41.add(24).cast::<usize>() = len51;
            *ptr41.add(20).cast::<*mut u8>() = result51;
        }
        Err(e) => {
            *ptr41.add(0).cast::<u8>() = (1i32) as u8;
            let vec52 = (e.into_bytes()).into_boxed_slice();
            let ptr52 = vec52.as_ptr().cast::<u8>();
            let len52 = vec52.len();
            ::core::mem::forget(vec52);
            *ptr41.add(8).cast::<usize>() = len52;
            *ptr41.add(4).cast::<*mut u8>() = ptr52.cast_mut();
        }
    };
    ptr41
}
#[doc(hidden)]
#[allow(non_snake_case)]
pub unsafe fn __post_return_generate<T: Guest>(arg0: *mut u8) {
    let l0 = i32::from(*arg0.add(0).cast::<u8>());
    match l0 {
        0 => {
            let l1 = *arg0.add(4).cast::<*mut u8>();
            let l2 = *arg0.add(8).cast::<usize>();
            let base8 = l1;
            let len8 = l2;
            for i in 0..len8 {
                let base = base8.add(i * 16);
                {
                    let l3 = *base.add(0).cast::<*mut u8>();
                    let l4 = *base.add(4).cast::<usize>();
                    _rt::cabi_dealloc(l3, l4, 1);
                    let l5 = *base.add(8).cast::<*mut u8>();
                    let l6 = *base.add(12).cast::<usize>();
                    let base7 = l5;
                    let len7 = l6;
                    _rt::cabi_dealloc(base7, len7 * 1, 1);
                }
            }
            _rt::cabi_dealloc(base8, len8 * 16, 4);
            let l9 = *arg0.add(12).cast::<*mut u8>();
            let l10 = *arg0.add(16).cast::<usize>();
            let base13 = l9;
            let len13 = l10;
            for i in 0..len13 {
                let base = base13.add(i * 8);
                {
                    let l11 = *base.add(0).cast::<*mut u8>();
                    let l12 = *base.add(4).cast::<usize>();
                    _rt::cabi_dealloc(l11, l12, 1);
                }
            }
            _rt::cabi_dealloc(base13, len13 * 8, 4);
            let l14 = *arg0.add(20).cast::<*mut u8>();
            let l15 = *arg0.add(24).cast::<usize>();
            let base18 = l14;
            let len18 = l15;
            for i in 0..len18 {
                let base = base18.add(i * 12);
                {
                    let l16 = *base.add(0).cast::<*mut u8>();
                    let l17 = *base.add(4).cast::<usize>();
                    _rt::cabi_dealloc(l16, l17, 1);
                }
            }
            _rt::cabi_dealloc(base18, len18 * 12, 4);
        }
        _ => {
            let l19 = *arg0.add(4).cast::<*mut u8>();
            let l20 = *arg0.add(8).cast::<usize>();
            _rt::cabi_dealloc(l19, l20, 1);
        }
    }
}
#[doc(hidden)]
#[allow(non_snake_case)]
pub unsafe fn _export_generate_types_cabi<T: Guest>(arg0: *mut u8) -> *mut u8 {
    #[cfg(target_arch = "wasm32")] _rt::run_ctors_once();
    let l0 = *arg0.add(0).cast::<*mut u8>();
    let l1 = *arg0.add(4).cast::<usize>();
    let len2 = l1;
    let bytes2 = _rt::Vec::from_raw_parts(l0.cast(), len2, len2);
    let l3 = i32::from(*arg0.add(8).cast::<u8>());
    let v13 = match l3 {
        0 => {
            let e13 = {
                let l4 = *arg0.add(12).cast::<*mut u8>();
                let l5 = *arg0.add(16).cast::<usize>();
                let len6 = l5;
                let bytes6 = _rt::Vec::from_raw_parts(l4.cast(), len6, len6);
                _rt::string_lift(bytes6)
            };
            Wit::Source(e13)
        }
        1 => {
            let e13 = {
                let l7 = *arg0.add(12).cast::<*mut u8>();
                let l8 = *arg0.add(16).cast::<usize>();
                let len9 = l8;
                _rt::Vec::from_raw_parts(l7.cast(), len9, len9)
            };
            Wit::Binary(e13)
        }
        n => {
            debug_assert_eq!(n, 2, "invalid enum discriminant");
            let e13 = {
                let l10 = *arg0.add(12).cast::<*mut u8>();
                let l11 = *arg0.add(16).cast::<usize>();
                let len12 = l11;
                let bytes12 = _rt::Vec::from_raw_parts(l10.cast(), len12, len12);
                _rt::string_lift(bytes12)
            };
            Wit::Path(e13)
        }
    };
    let l14 = i32::from(*arg0.add(20).cast::<u8>());
    let l18 = i32::from(*arg0.add(32).cast::<u8>());
    let l20 = i32::from(*arg0.add(34).cast::<u8>());
    let l23 = i32::from(*arg0.add(36).cast::<u8>());
    let l33 = i32::from(*arg0.add(48).cast::<u8>());
    let result42 = T::generate_types(
        _rt::string_lift(bytes2),
        TypeGenerationOptions {
            wit: v13,
            world: match l14 {
                0 => None,
                1 => {
                    let e = {
                        let l15 = *arg0.add(24).cast::<*mut u8>();
                        let l16 = *arg0.add(28).cast::<usize>();
                        let len17 = l16;
                        let bytes17 = _rt::Vec::from_raw_parts(l15.cast(), len17, len17);
                        _rt::string_lift(bytes17)
                    };
                    Some(e)
                }
                _ => _rt::invalid_enum_discriminant(),
            },
            tla_compat: match l18 {
                0 => None,
                1 => {
                    let e = {
                        let l19 = i32::from(*arg0.add(33).cast::<u8>());
                        _rt::bool_lift(l19 as u8)
                    };
                    Some(e)
                }
                _ => _rt::invalid_enum_discriminant(),
            },
            instantiation: match l20 {
                0 => None,
                1 => {
                    let e = {
                        let l21 = i32::from(*arg0.add(35).cast::<u8>());
                        let v22 = match l21 {
                            0 => InstantiationMode::Async,
                            n => {
                                debug_assert_eq!(n, 1, "invalid enum discriminant");
                                InstantiationMode::Sync
                            }
                        };
                        v22
                    };
                    Some(e)
                }
                _ => _rt::invalid_enum_discriminant(),
            },
            map: match l23 {
                0 => None,
                1 => {
                    let e = {
                        let l24 = *arg0.add(40).cast::<*mut u8>();
                        let l25 = *arg0.add(44).cast::<usize>();
                        let base32 = l24;
                        let len32 = l25;
                        let mut result32 = _rt::Vec::with_capacity(len32);
                        for i in 0..len32 {
                            let base = base32.add(i * 16);
                            let e32 = {
                                let l26 = *base.add(0).cast::<*mut u8>();
                                let l27 = *base.add(4).cast::<usize>();
                                let len28 = l27;
                                let bytes28 = _rt::Vec::from_raw_parts(
                                    l26.cast(),
                                    len28,
                                    len28,
                                );
                                let l29 = *base.add(8).cast::<*mut u8>();
                                let l30 = *base.add(12).cast::<usize>();
                                let len31 = l30;
                                let bytes31 = _rt::Vec::from_raw_parts(
                                    l29.cast(),
                                    len31,
                                    len31,
                                );
                                (_rt::string_lift(bytes28), _rt::string_lift(bytes31))
                            };
                            result32.push(e32);
                        }
                        _rt::cabi_dealloc(base32, len32 * 16, 4);
                        result32
                    };
                    Some(e)
                }
                _ => _rt::invalid_enum_discriminant(),
            },
            features: match l33 {
                0 => None,
                1 => {
                    let e = {
                        let l34 = i32::from(*arg0.add(52).cast::<u8>());
                        let v41 = match l34 {
                            0 => {
                                let e41 = {
                                    let l35 = *arg0.add(56).cast::<*mut u8>();
                                    let l36 = *arg0.add(60).cast::<usize>();
                                    let base40 = l35;
                                    let len40 = l36;
                                    let mut result40 = _rt::Vec::with_capacity(len40);
                                    for i in 0..len40 {
                                        let base = base40.add(i * 8);
                                        let e40 = {
                                            let l37 = *base.add(0).cast::<*mut u8>();
                                            let l38 = *base.add(4).cast::<usize>();
                                            let len39 = l38;
                                            let bytes39 = _rt::Vec::from_raw_parts(
                                                l37.cast(),
                                                len39,
                                                len39,
                                            );
                                            _rt::string_lift(bytes39)
                                        };
                                        result40.push(e40);
                                    }
                                    _rt::cabi_dealloc(base40, len40 * 8, 4);
                                    result40
                                };
                                EnabledFeatureSet::List(e41)
                            }
                            n => {
                                debug_assert_eq!(n, 1, "invalid enum discriminant");
                                EnabledFeatureSet::All
                            }
                        };
                        v41
                    };
                    Some(e)
                }
                _ => _rt::invalid_enum_discriminant(),
            },
        },
    );
    _rt::cabi_dealloc(arg0, 64, 4);
    let ptr43 = _RET_AREA.0.as_mut_ptr().cast::<u8>();
    match result42 {
        Ok(e) => {
            *ptr43.add(0).cast::<u8>() = (0i32) as u8;
            let vec47 = e;
            let len47 = vec47.len();
            let layout47 = _rt::alloc::Layout::from_size_align_unchecked(
                vec47.len() * 16,
                4,
            );
            let result47 = if layout47.size() != 0 {
                let ptr = _rt::alloc::alloc(layout47).cast::<u8>();
                if ptr.is_null() {
                    _rt::alloc::handle_alloc_error(layout47);
                }
                ptr
            } else {
                { ::core::ptr::null_mut() }
            };
            for (i, e) in vec47.into_iter().enumerate() {
                let base = result47.add(i * 16);
                {
                    let (t44_0, t44_1) = e;
                    let vec45 = (t44_0.into_bytes()).into_boxed_slice();
                    let ptr45 = vec45.as_ptr().cast::<u8>();
                    let len45 = vec45.len();
                    ::core::mem::forget(vec45);
                    *base.add(4).cast::<usize>() = len45;
                    *base.add(0).cast::<*mut u8>() = ptr45.cast_mut();
                    let vec46 = (t44_1).into_boxed_slice();
                    let ptr46 = vec46.as_ptr().cast::<u8>();
                    let len46 = vec46.len();
                    ::core::mem::forget(vec46);
                    *base.add(12).cast::<usize>() = len46;
                    *base.add(8).cast::<*mut u8>() = ptr46.cast_mut();
                }
            }
            *ptr43.add(8).cast::<usize>() = len47;
            *ptr43.add(4).cast::<*mut u8>() = result47;
        }
        Err(e) => {
            *ptr43.add(0).cast::<u8>() = (1i32) as u8;
            let vec48 = (e.into_bytes()).into_boxed_slice();
            let ptr48 = vec48.as_ptr().cast::<u8>();
            let len48 = vec48.len();
            ::core::mem::forget(vec48);
            *ptr43.add(8).cast::<usize>() = len48;
            *ptr43.add(4).cast::<*mut u8>() = ptr48.cast_mut();
        }
    };
    ptr43
}
#[doc(hidden)]
#[allow(non_snake_case)]
pub unsafe fn __post_return_generate_types<T: Guest>(arg0: *mut u8) {
    let l0 = i32::from(*arg0.add(0).cast::<u8>());
    match l0 {
        0 => {
            let l1 = *arg0.add(4).cast::<*mut u8>();
            let l2 = *arg0.add(8).cast::<usize>();
            let base8 = l1;
            let len8 = l2;
            for i in 0..len8 {
                let base = base8.add(i * 16);
                {
                    let l3 = *base.add(0).cast::<*mut u8>();
                    let l4 = *base.add(4).cast::<usize>();
                    _rt::cabi_dealloc(l3, l4, 1);
                    let l5 = *base.add(8).cast::<*mut u8>();
                    let l6 = *base.add(12).cast::<usize>();
                    let base7 = l5;
                    let len7 = l6;
                    _rt::cabi_dealloc(base7, len7 * 1, 1);
                }
            }
            _rt::cabi_dealloc(base8, len8 * 16, 4);
        }
        _ => {
            let l9 = *arg0.add(4).cast::<*mut u8>();
            let l10 = *arg0.add(8).cast::<usize>();
            _rt::cabi_dealloc(l9, l10, 1);
        }
    }
}
pub trait Guest {
    /// Generate the file structure for the transpiled of a component
    /// into a JS embedding, returns the file list and imports and exports of the
    /// output JS generation component
    fn generate(
        component: _rt::Vec<u8>,
        options: GenerateOptions,
    ) -> Result<Transpiled, _rt::String>;
    fn generate_types(
        name: _rt::String,
        options: TypeGenerationOptions,
    ) -> Result<Files, _rt::String>;
}
#[doc(hidden)]
macro_rules! __export_world_js_component_bindgen_cabi {
    ($ty:ident with_types_in $($path_to_types:tt)*) => {
        const _ : () = { #[export_name = "generate"] unsafe extern "C" fn
        export_generate(arg0 : * mut u8,) -> * mut u8 { $($path_to_types)*::
        _export_generate_cabi::<$ty > (arg0) } #[export_name = "cabi_post_generate"]
        unsafe extern "C" fn _post_return_generate(arg0 : * mut u8,) {
        $($path_to_types)*:: __post_return_generate::<$ty > (arg0) } #[export_name =
        "generate-types"] unsafe extern "C" fn export_generate_types(arg0 : * mut u8,) ->
        * mut u8 { $($path_to_types)*:: _export_generate_types_cabi::<$ty > (arg0) }
        #[export_name = "cabi_post_generate-types"] unsafe extern "C" fn
        _post_return_generate_types(arg0 : * mut u8,) { $($path_to_types)*::
        __post_return_generate_types::<$ty > (arg0) } };
    };
}
#[doc(hidden)]
pub(crate) use __export_world_js_component_bindgen_cabi;
#[repr(align(4))]
struct _RetArea([::core::mem::MaybeUninit<u8>; 28]);
static mut _RET_AREA: _RetArea = _RetArea([::core::mem::MaybeUninit::uninit(); 28]);
mod _rt {
    pub use alloc_crate::vec::Vec;
    pub use alloc_crate::string::String;
    #[cfg(target_arch = "wasm32")]
    pub fn run_ctors_once() {
        wit_bindgen_rt::run_ctors_once();
    }
    pub unsafe fn string_lift(bytes: Vec<u8>) -> String {
        if cfg!(debug_assertions) {
            String::from_utf8(bytes).unwrap()
        } else {
            String::from_utf8_unchecked(bytes)
        }
    }
    pub unsafe fn bool_lift(val: u8) -> bool {
        if cfg!(debug_assertions) {
            match val {
                0 => false,
                1 => true,
                _ => panic!("invalid bool discriminant"),
            }
        } else {
            val != 0
        }
    }
    pub unsafe fn invalid_enum_discriminant<T>() -> T {
        if cfg!(debug_assertions) {
            panic!("invalid enum discriminant")
        } else {
            core::hint::unreachable_unchecked()
        }
    }
    pub unsafe fn cabi_dealloc(ptr: *mut u8, size: usize, align: usize) {
        if size == 0 {
            return;
        }
        let layout = alloc::Layout::from_size_align_unchecked(size, align);
        alloc::dealloc(ptr, layout);
    }
    pub use alloc_crate::alloc;
    extern crate alloc as alloc_crate;
}
/// Generates `#[no_mangle]` functions to export the specified type as the
/// root implementation of all generated traits.
///
/// For more information see the documentation of `wit_bindgen::generate!`.
///
/// ```rust
/// # macro_rules! export{ ($($t:tt)*) => (); }
/// # trait Guest {}
/// struct MyType;
///
/// impl Guest for MyType {
///     // ...
/// }
///
/// export!(MyType);
/// ```
#[allow(unused_macros)]
#[doc(hidden)]
macro_rules! __export_js_component_bindgen_impl {
    ($ty:ident) => {
        self::export!($ty with_types_in self);
    };
    ($ty:ident with_types_in $($path_to_types_root:tt)*) => {
        $($path_to_types_root)*:: __export_world_js_component_bindgen_cabi!($ty
        with_types_in $($path_to_types_root)*);
    };
}
#[doc(inline)]
pub(crate) use __export_js_component_bindgen_impl as export;
#[cfg(target_arch = "wasm32")]
#[link_section = "component-type:wit-bindgen:0.30.0:js-component-bindgen:encoded world"]
#[doc(hidden)]
pub static __WIT_BINDGEN_COMPONENT_TYPE: [u8; 927] = *b"\
\0asm\x0d\0\x01\0\0\x19\x16wit-component-encoding\x04\0\x07\x94\x06\x01A\x02\x01\
A'\x01p}\x01o\x02s\0\x01p\x01\x03\0\x05files\x03\0\x02\x01o\x02ss\x01p\x04\x03\0\
\x04maps\x03\0\x05\x01q\x02\x05async\0\0\x04sync\0\0\x03\0\x12instantiation-mode\
\x03\0\x07\x01q\x04\x02js\0\0\x06hybrid\0\0\x09optimized\0\0\x10direct-optimized\
\0\0\x03\0\x0dbindings-mode\x03\0\x09\x01k\x7f\x01k\x08\x01k\x0a\x01k\x06\x01ky\x01\
r\x0d\x04names\x0dno-typescript\x0b\x0dinstantiation\x0c\x0fimport-bindings\x0d\x03\
map\x0e\x06compat\x0b\x10no-nodejs-compat\x0b\x0dbase64-cutoff\x0f\x0atla-compat\
\x0b\x1avalid-lifting-optimization\x0b\x07tracing\x0b\x15no-namespaced-exports\x0b\
\x0cmulti-memory\x0b\x03\0\x10generate-options\x03\0\x10\x01q\x03\x06source\x01s\
\0\x06binary\x01\0\0\x04path\x01s\0\x03\0\x03wit\x03\0\x12\x01ps\x01q\x02\x04lis\
t\x01\x14\0\x03all\0\0\x03\0\x13enabled-feature-set\x03\0\x15\x01ks\x01k\x16\x01\
r\x06\x03wit\x13\x05world\x17\x0atla-compat\x0b\x0dinstantiation\x0c\x03map\x0e\x08\
features\x18\x03\0\x17type-generation-options\x03\0\x19\x01m\x02\x08function\x08\
instance\x03\0\x0bexport-type\x03\0\x1b\x01o\x02s\x1c\x01p\x1d\x01r\x03\x05files\
\x03\x07imports\x14\x07exports\x1e\x03\0\x0atranspiled\x03\0\x1f\x01j\x01\x20\x01\
s\x01@\x02\x09component\0\x07options\x11\0!\x04\0\x08generate\x01\"\x01j\x01\x03\
\x01s\x01@\x02\x04names\x07options\x1a\0#\x04\0\x0egenerate-types\x01$\x04\x01/l\
ocal:js-component-bindgen/js-component-bindgen\x04\0\x0b\x1a\x01\0\x14js-compone\
nt-bindgen\x03\0\0\0G\x09producers\x01\x0cprocessed-by\x02\x0dwit-component\x070\
.215.0\x10wit-bindgen-rust\x060.30.0";
#[inline(never)]
#[doc(hidden)]
pub fn __link_custom_section_describing_imports() {
    wit_bindgen_rt::maybe_link_cabi_realloc();
}
