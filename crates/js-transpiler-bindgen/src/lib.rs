use anyhow::Result;
use std::sync::Once;
use wit_bindgen_core::{Files};
mod bindgen;
mod component;

wit_bindgen_guest_rust::generate!("js-transpiler-bindgen.wit");

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
    fn generate(
        component: Vec<u8>,
        options: js_transpiler_bindgen::GenerateOptions,
    ) -> Result<Vec<(String, Vec<u8>)>, String> {
        init();

        let mut out: Vec<(String, Vec<u8>)> = Vec::new();

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

        generate(component, &options.name, opts, &mut out)
            .map_err(|e| format!("{:?}", e))?;

        Ok(out)
    }
}

fn generate (component: Vec<u8>, name: &str, opts: bindgen::Opts, out: &mut Vec<(String, Vec<u8>)>) -> Result<(), anyhow::Error> {
    let mut gen = opts.build()?;
    let mut files = Files::default();
    component::generate(&mut *gen, name, &component, &mut files)?;
    for (name, source) in files.iter() {
        out.push((String::from(name), source.to_vec()));
    }
    Ok(())
}
