//! Exercise the parser types as a Rust consumer with its own dependencies.

use js_component_bindgen::TranspileOpts;

const WIT: &str = r#"
    package test:parser@1.2.3;
    interface handles {
        resource token;
        inspect: func(value: borrow<token>) -> u32;
    }
    world api { import handles; export run: func() -> u32; }
"#;

#[test]
fn root_api_accepts_wit_parser_259() {
    let mut resolve: js_component_bindgen::source::wit_parser::Resolve =
        wit_parser_259::Resolve::default();
    let package = resolve.push_str("api.wit", WIT).unwrap();
    let world = resolve.select_world(&[package], Some("api")).unwrap();
    let files =
        js_component_bindgen::generate_types("api", resolve, world, TranspileOpts::default())
            .unwrap();
    assert!(files.iter().any(|(name, _)| name == "api.d.ts"));

    fn accepts_bindgen<T: wit_bindgen_core_062::abi::Bindgen>() {}
    accepts_bindgen::<js_component_bindgen::function_bindgen::FunctionBindgen<'_>>();
}

#[cfg(feature = "wit-parser-262")]
#[test]
fn both_parser_versions_generate_the_same_declarations() {
    #[cfg(not(feature = "wit-parser-259"))]
    use js_component_bindgen::generate_types_with_config;
    #[cfg(feature = "wit-parser-259")]
    use js_component_bindgen::wit_parser_259::generate_types_with_config;
    use js_component_bindgen::wit_parser_262 as bindgen_262;

    let config = js_component_bindgen::TranspileConfig::default();
    let mut old = wit_parser_259::Resolve::default();
    let pkg = old.push_str("api.wit", WIT).unwrap();
    let world = old.select_world(&[pkg], Some("api")).unwrap();
    let expected = generate_types_with_config("api", old, world, config.clone()).unwrap();

    let mut new = wit_parser_262::Resolve::default();
    let pkg = new.push_str("api.wit", WIT).unwrap();
    let world = new.select_world(&[pkg], Some("api")).unwrap();
    assert_eq!(
        bindgen_262::generate_types_with_config("api", new, world, config).unwrap(),
        expected
    );

    fn accepts_bindgen<T: wit_bindgen_core_063::abi::Bindgen>() {}
    accepts_bindgen::<bindgen_262::function_bindgen::FunctionBindgen<'_>>();
}
