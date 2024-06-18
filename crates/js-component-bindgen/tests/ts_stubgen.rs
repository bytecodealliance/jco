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
            ConstructorBlob: ConstructorBlobStatic
        }

        // All functions must be `static` on a class
        export interface ConstructorBlobStatic {
            new(init: Uint8Array): ConstructorBlobBase,
            merge(lhs: Blob, rhs: Blob): Blob,
        }
        export interface ConstructorBlobBase {
            write(bytes: Uint8Array): void,
            read(n: number): Uint8Array,
        }

        export interface TestGuest {
            resourceTest: ResourceTest,
        }
    ";

    test_single_file(wit, expected, "test");
}

#[track_caller]
fn test_single_file(wit: &str, expected: &str, world_name: &str) {
    #[track_caller]
    fn compare_str(expected: &str, actual: &str) {
        let expected = remove_whitespace(expected);
        let actual = remove_whitespace(actual);
        assert_eq!(actual, expected);
    }

    fn remove_whitespace(s: &str) -> String {
        s.lines()
            .map(|l| l.trim())
            .filter(|l| !l.is_empty())
            .collect::<Vec<_>>()
            .join("\n")
    }

    let resolver = create_single_resolver("test.wit", wit);
    let mut files = js_component_bindgen::files::Files::default();

    let world = resolver
        .worlds
        .iter()
        .find(|(_, w)| w.name == world_name)
        .expect("world exists")
        .0;

    ts_stubgen(&resolver, world, &mut files);

    let file_name = format!("{world_name}.d.ts");
    let file = files.remove(&file_name).expect("File exists");
    let actual = std::str::from_utf8(&file).expect("valid_utf8");

    compare_str(actual, expected);
}

fn create_single_resolver(
    path: &str,
    content: &str,
) -> js_component_bindgen::source::wit_parser::Resolve {
    let mut resolve = js_component_bindgen::source::wit_parser::Resolve::default();
    let package = UnresolvedPackage::parse(path.as_ref(), content.trim()).expect("valid wit");
    resolve.push(package).expect("push package");
    resolve
}
