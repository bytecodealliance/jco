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
fn test_basic_ts() {
    let wit = "
        package test:t-basic;

        world test {
            export basic-test;
        }

        interface basic-test {
            bool-test: func(a: bool) -> bool;
            s8-test: func(a: s8) -> s8;
            s16-test: func(a: s16) -> s16;
            s32-test: func(a: s32) -> s32;
            s64-test: func(a: s64) -> s64;
            u8-test: func(a: u8) -> u8;
            u16-test: func(a: u16) -> u16;
            u32-test: func(a: u32) -> u32;
            u64-test: func(a: u64) -> u64;
            f32-test: func(a: f32) -> f32;
            f64-test: func(a: f64) -> f64;
            char-test: func(c: char) -> char;
            string-test: func(s: string) -> string;
            u8-list-test: func(a: list<u8>) -> list<u8>;
            string-list-test: func(a: list<string>) -> list<string>;
            option-nullable-test: func(a: option<u8>) -> option<u8>;
            option-nested-test: func(a: option<option<u8>>) -> option<option<u8>>;
            result-success-test: func(a: u8) -> result<u8>;
            result-fail-test: func(a: u8) -> result<_, u8>;
            result-both-test: func(a: u8) -> result<u8, u8>;
            result-none-test: func() -> result;

            variant variant-test {
                none,
                any,
                something(string)
            }

            variant enum-test {
                a,
                b,
                c,
            }

            record record-test {
                a: u8,
                b: string,
                c: option<enum-test>
            }

            flags flag-test {
                a,
                b,
                c,
            }
        }
    ";

    let expected = "
        export interface BasicTest {
            boolTest(a: boolean): boolean,
            s8Test(a: number): number,
            s16Test(a: number): number,
            s32Test(a: number): number,
            s64Test(a: bigint): bigint,
            u8Test(a: number): number,
            u16Test(a: number): number,
            u32Test(a: number): number,
            u64Test(a: bigint): bigint,
            f32Test(a: number): number,
            f64Test(a: number): number,
            charTest(c: string): string,
            stringTest(s: string): string,
            u8ListTest(a: Uint8Array): Uint8Array,
            stringListTest(a: string[]): string[],
            optionNullableTest(a: number | undefined): number | undefined,
            optionNestedTest(a: Option<number | undefined>): Option<number | undefined>,
            resultSuccessTest(a: number): Result<number, void>,
            resultFailTest(a: number): Result<void, number>,
            resultBothTest(a: number): Result<number, number>,
            resultNoneTest(): Result<void, void>,
        }
        export type VariantTest = VariantTestNone | VariantTestAny | VariantTestSomething;
        export interface VariantTestNone {
            tag: 'none',
        }
        export interface VariantTestAny {
            tag: 'any',
        }
        export interface VariantTestSomething {
            tag: 'something',
            val: string,
        }
        export type EnumTest = EnumTestA | EnumTestB | EnumTestC;
        export interface EnumTestA {
            tag: 'a',
        }
        export interface EnumTestB {
            tag: 'b',
        }
        export interface EnumTestC {
            tag: 'c',
        }
        export interface RecordTest {
            a: number,
            b: string,
            c?: EnumTest,
        }
        export interface FlagTest {
            a?: boolean,
            b?: boolean,
            c?: boolean,
        }
        export type Option<T> = { tag: 'none' } | { tag: 'some', val: T };
        export type Result<T, E> = { tag: 'ok', val: T } | { tag: 'err', val: E };

        export interface TestGuest {
            basicTest: BasicTest,
        }
";

    test_single_file(wit, expected);
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

#[test]
fn test_imports() {
    let wit = &[
        WitFile {
            wit: "
                package test:types;

                interface types {
                    type dimension = u32;
                    record point {
                        x: dimension,
                        y: dimension,
                    }
                }
            ",
        },
        WitFile {
            wit: "
                package test:canvas;

                interface canvas {
                    use test:types/types.{dimension, point};
                    type canvas-id = u64;
                    draw-line: func(canvas: canvas-id, origin: point, target: point, thickness: dimension);
                }
            ",
        },
        WitFile {
            wit: "
                package test:t-imports;

                world test {
                    import test:canvas/canvas;
                    export run: func();
                }
            ",
        },
    ];

    let expected = &[
        ExpectedTs {
            file_name: "test.d.ts",
            expected: "
            export interface TestGuest {
                run(): void,
            }",
        },
        ExpectedTs {
            file_name: "interfaces/test-canvas-canvas.d.ts",
            expected: r#"
            declare module "test:canvas/canvas" {
                import type { Dimension } from "test:types/types";
                import type { Point } from "test:types/types";
                export type CanvasId = bigint;
                export function drawLine(canvas: CanvasId, origin: Point, target: Point, thickness: Dimension): void;
            } 
            "#,
        },
        ExpectedTs {
            file_name: "interfaces/test-types-types.d.ts",
            expected: r#"
            declare module "test:types/types" {
                export type Dimension = number;
                export interface Point {
                    x: Dimension,
                    y: Dimension,
                }
            } 
            "#,
        },
    ];

    test_files(wit, expected);
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

    let world = resolver
        .worlds
        .iter()
        .find(|(_, w)| w.name == "test")
        .expect("world exists")
        .0;

    let mut files = js_component_bindgen::files::Files::default();
    ts_stubgen(&resolver, world, &mut files);

    for ExpectedTs {
        file_name,
        expected,
    } in expected
    {
        let Some(file) = files.remove(&file_name) else {
            let all_files = files.iter().map(|(name, _)| name).collect::<Vec<_>>();
            panic!("Expected file `{file_name}` not found in files: {all_files:?}",)
        };
        let actual = std::str::from_utf8(&file).expect("valid utf8");
        compare_str(actual, expected);
    }
}

#[track_caller]
fn test_single_file(wit: &'static str, expected: &'static str) {
    test_files(
        &[WitFile { wit }],
        &[ExpectedTs {
            file_name: "test.d.ts",
            expected,
        }],
    )
}

#[track_caller]
fn compare_str(actual: &str, expected: &str) {
    fn remove_whitespace(s: &str) -> impl Iterator<Item = &str> {
        s.lines().map(|l| l.trim()).filter(|l| !l.is_empty())
    }

    let mut expected_iter = remove_whitespace(expected);
    let mut actual_iter = remove_whitespace(actual);

    loop {
        match (expected_iter.next(), actual_iter.next()) {
            (None, None) => break,
            (Some(e), Some(a)) => {
                assert_eq!(e, a, "\nExpected:`{e}`\nActual:`{a}`\nFull:\n{actual}");
            }
            (e, a) => {
                assert_eq!(e, a, "\nExpected:`{e:?}`\nActual:`{a:?}`\nFull:\n{actual}");
            }
        }
    }
}
