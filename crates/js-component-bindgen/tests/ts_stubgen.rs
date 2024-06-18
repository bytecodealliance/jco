use std::path::PathBuf;

use js_component_bindgen::ts_stubgen::ts_stubgen;
use wit_parser::UnresolvedPackage;

static IS_DEBUG: bool = true;

#[test]
fn test_ts_stubgen() {
    let mut resolve = js_component_bindgen::source::wit_parser::Resolve::default();
    let path = PathBuf::from("tests/wit/")
        .canonicalize()
        .expect("Valid Path");
    resolve.push_path(&path).expect("Valid WIT");

    let id = resolve
        .worlds
        .iter()
        .find(|(_, w)| w.name == "caller")
        .expect("caller world exists")
        .0;

    let mut files = js_component_bindgen::files::Files::default();
    ts_stubgen(&resolve, id, &mut files);

    // Write output to files
    if IS_DEBUG {
        let prefix = PathBuf::from("tests/temp/");

        std::fs::remove_dir_all(&prefix).ok();

        files.iter().for_each(|(name, data)| {
            let name = name.to_string();
            let data = String::from_utf8(data.to_vec()).unwrap();
            let path = prefix.join(name);

            // Create the parent directory if it doesn't exist
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent).expect("Create parent directory");
            }

            std::fs::write(path, data).expect("Write file");
        });
    }
}

#[test]
fn test_export_resource() {
    let wit = "
        package test:t-resource;

        world test {
            export resource-test;
        }

        interface resource-test {
            resource blob {
                constructor(init: list<u8>);
                write: func(bytes: list<u8>);
                read: func(n: u32) -> list<u8>;
                merge: static func(lhs: blob, rhs: blob) -> blob;
            }
        }
    ";

    let expected = "
        export interface ResourceTest {
            Blob: BlobStatic
        }

        // All functions must be `static` on a class
        export interface BlobStatic {
            new(init: Uint8Array): BlobBase,
            merge(lhs: BlobBase, rhs: BlobBase): BlobBase,
        }
        export interface BlobBase {
            write(bytes: Uint8Array): void,
            read(n: number): Uint8Array,
        }

        export interface TestGuest {
            resourceTest: ResourceTest,
        }
    ";

    test_single_file(wit, expected);
}

struct WitFile {
    wit: &'static str,
}

struct ExpectedTs {
    file_name: &'static str,
    expected: &'static str,
}

#[track_caller]
fn test_files(wit: &[WitFile], expected: &[ExpectedTs]) {
    let mut resolver = js_component_bindgen::source::wit_parser::Resolve::default();

    for (ii, wit_file) in wit.iter().enumerate() {
        let file_name = format!("tests{ii}.wit");
        let package =
            UnresolvedPackage::parse(file_name.as_ref(), wit_file.wit).expect("valid wit");
        resolver.push(package).expect("push package");
    }

    let mut files = js_component_bindgen::files::Files::default();

    let world = resolver
        .worlds
        .iter()
        .find(|(_, w)| w.name == "test")
        .expect("world exists")
        .0;

    ts_stubgen(&resolver, world, &mut files);

    for ExpectedTs {
        file_name,
        expected,
    } in expected
    {
        let file_name = format!("{file_name}.d.ts");
        let file = files.remove(&file_name).expect("file exists");
        let actual = std::str::from_utf8(&file).expect("valid utf8");
        compare_str(actual, expected);
    }
}

#[track_caller]
fn test_single_file(wit: &'static str, expected: &'static str) {
    test_files(
        &[WitFile { wit }],
        &[ExpectedTs {
            file_name: "test",
            expected,
        }],
    )
}

#[track_caller]
fn compare_str(expected: &str, actual: &str) {
    fn remove_whitespace(s: &str) -> impl Iterator<Item = &str> {
        s.lines().map(|l| l.trim()).filter(|l| !l.is_empty())
    }

    let mut expected = remove_whitespace(expected);
    let mut actual = remove_whitespace(actual);

    loop {
        match (expected.next(), actual.next()) {
            (Some(e), Some(a)) => assert_eq!(e, a),
            (None, None) => break,
            (e, a) => {
                assert_eq!(e, a, "Expected: {:?}, Actual: {:?}", e, a);
            }
        }
    }
}
