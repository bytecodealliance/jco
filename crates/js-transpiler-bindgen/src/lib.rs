use anyhow::Result;
use std::sync::Once;
use wit_bindgen_core::Files;
mod bindgen;
mod component;

wit_bindgen_guest_rust::generate!("js-transpiler-bindgen.wit");

use js_transpiler_bindgen::*;

struct JsTranspilerBindgen;

export_js_transpiler_bindgen!(JsTranspilerBindgen);

fn init() {
    static INIT: Once = Once::new();
    INIT.call_once(|| {
        let prev_hook = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |info| {
            console::error(&info.to_string());
            prev_hook(info);
        }));
    });
}

impl js_transpiler_bindgen::JsTranspilerBindgen for JsTranspilerBindgen {
    fn generate(component: Vec<u8>, options: GenerateOptions) -> Result<Transpiled, String> {
        init();

        let opts = bindgen::Opts {
            no_typescript: options.no_typescript.unwrap_or(false),
            instantiation: options.instantiation.unwrap_or(false),
            map: match options.map {
                Some(map) => Some(map.into_iter().collect()),
                None => None,
            },
            compat: options.compat.unwrap_or(false),
            no_nodejs_compat: options.no_nodejs_compat.unwrap_or(false),
            base64_cutoff: options.base64_cutoff.unwrap_or(5000) as usize,
            tla_compat: options.tla_compat.unwrap_or(false),
            valid_lifting_optimization: options.valid_lifting_optimization.unwrap_or(false),
        };

        let out = generate(component, &options.name, opts).map_err(|e| format!("{:?}", e))?;

        Ok(out)
    }
}

fn generate(
    component: Vec<u8>,
    name: &str,
    opts: bindgen::Opts,
) -> Result<Transpiled, anyhow::Error> {
    let mut gen = opts.build()?;
    let mut files_obj = Files::default();
    let component::ComponentInfo { imports, exports } =
        component::generate(&mut *gen, name, &component, &mut files_obj)?;

    let mut files: Vec<(String, Vec<u8>)> = Vec::new();
    for (name, source) in files_obj.iter() {
        files.push((String::from(name), source.to_vec()));
    }
    Ok(Transpiled {
        files,
        imports,
        exports,
    })
}
