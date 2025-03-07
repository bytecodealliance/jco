import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { componentNew, componentEmbed, transpile, types } from "../src/api.js";
import { getTmpDir } from "./helpers.js";

import { suite, test, beforeAll, afterAll, afterEach, assert } from "vitest";

suite("WIT", () => {
  var tmpDir;
  var outFile;

  // Content of test/fixtures/wits/feature-gates.wit
  var featureGatesWitContent;
  var featureGatesWitPath;

  beforeAll(async function () {
    tmpDir = await getTmpDir();
    outFile = resolve(tmpDir, "out-component-file");
    featureGatesWitPath = resolve("test/fixtures/wits/feature-gates.wit");
    featureGatesWitContent = await readFile(featureGatesWitPath, "utf8");
  });

  afterAll(async function () {
    try {
      await rm(tmpDir, { recursive: true });
    } catch {}
  });

  afterEach(async function () {
    try {
      await rm(outFile);
    } catch {}
  });

  // (transpile): features marked @unstable should *not* be present when no features are enabled
  //
  // NOTE: this works primarily the features are fed through to the `wit_parser::Resolve` that is used,
  // not due to active filtering on the jco side.
  test("Feature gates (no features)", async () => {
    // Build a dummy WIT component
    const generatedComponent = await componentEmbed({
      witSource: featureGatesWitContent,
      dummy: true,
      metadata: [
        ["language", [["javascript", ""]]],
        ["processed-by", [["dummy-gen", "test"]]],
      ],
    });
    const component = await componentNew(generatedComponent);

    // Transpile the component
    const { files, imports, exports } = await transpile(component);
    assert.deepStrictEqual(imports, ["test:feature-gates/foo"]);
    assert.deepStrictEqual(exports, [
      ["foo", "instance"],
      ["test:feature-gates/foo@0.2.1", "instance"],
    ]);
    assert.ok(files["component.js"], "component js was generated");
    assert.ok(files["component.d.ts"], "component typings were generated");
    assert.ok(
      files["interfaces/test-feature-gates-foo.d.ts"],
      "interface typings were generated"
    );

    // Check the interfaces file for the right exports
    const interfaces = Buffer.from(
      files["interfaces/test-feature-gates-foo.d.ts"]
    ).toString("utf8");
    assert.ok(
      interfaces.includes("export function a(): void;"),
      "unconstrained export foo/a is present"
    );
    assert.ok(
      interfaces.includes("export function b(): void;"),
      "@since(0.2.1) export foo/b is present (version matches)"
    );
    assert.ok(
      interfaces.includes("export function c(): void;"),
      "@since(0.2.1) export foo/c is present (feature is ignored)"
    );
    assert.ok(
      !interfaces.includes("export function d(): void;"),
      "@unstable(...) export is missing, without the feature specified"
    );
  });

  // (transpile): features marked @unstable should *not* be present when an unrelated feature is enabled
  //
  // NOTE: this works primarily the features are fed through to the `wit_parser::Resolve` that is used,
  // not due to active filtering on the jco side.
  test("Feature gates (unrelated feature)", async () => {
    // Build a dummy WIT component
    const generatedComponent = await componentEmbed({
      witSource: featureGatesWitContent,
      dummy: true,
      metadata: [
        ["language", [["javascript", ""]]],
        ["processed-by", [["dummy-gen", "test"]]],
      ],
      features: {
        tag: "list",
        val: ["some-feature"],
      },
    });
    const component = await componentNew(generatedComponent);

    // Transpile the component
    const { files, imports, exports } = await transpile(component);
    assert.deepStrictEqual(imports, ["test:feature-gates/foo"]);
    assert.deepStrictEqual(exports, [
      ["foo", "instance"],
      ["test:feature-gates/foo@0.2.1", "instance"],
    ]);
    assert.ok(files["component.js"], "component js was generated");
    assert.ok(files["component.d.ts"], "component typings were generated");
    assert.ok(
      files["interfaces/test-feature-gates-foo.d.ts"],
      "interface typings were generated"
    );

    // Check the interfaces file for the right exports
    const interfaces = Buffer.from(
      files["interfaces/test-feature-gates-foo.d.ts"]
    ).toString("utf8");
    assert.ok(
      interfaces.includes("export function a(): void;"),
      "unconstrained export foo/a is present"
    );
    assert.ok(
      interfaces.includes("export function b(): void;"),
      "@since(0.2.1) export foo/b is present (version matches)"
    );
    assert.ok(
      interfaces.includes("export function c(): void;"),
      "@since(0.2.1) export foo/c is present (feature is ignored)"
    );
    assert.ok(
      !interfaces.includes("export function d(): void;"),
      "@unstable(...) export is missing, without the feature specified"
    );
  });

  // (transpile): features marked @unstable shoudl be present in exports when only the specific feature is enabled
  //
  // NOTE: this works primarily the features are fed through to the `wit_parser::Resolve` that is used,
  // not due to active filtering on the jco side.
  test("Feature gates (single feature enabled)", async () => {
    // Build a dummy WIT component
    const generatedComponent = await componentEmbed({
      witSource: featureGatesWitContent,
      dummy: true,
      metadata: [
        ["language", [["javascript", ""]]],
        ["processed-by", [["dummy-gen", "test"]]],
      ],
      features: {
        tag: "list",
        val: ["fancier-foo"],
      },
    });
    const component = await componentNew(generatedComponent);

    // Transpile the component
    const { files, imports, exports } = await transpile(component);
    assert.deepStrictEqual(imports, ["test:feature-gates/foo"]);
    assert.deepStrictEqual(exports, [
      ["foo", "instance"],
      ["test:feature-gates/foo@0.2.1", "instance"],
    ]);
    assert.ok(files["component.js"], "component js was generated");
    assert.ok(files["component.d.ts"], "component typings were generated");
    assert.ok(
      files["interfaces/test-feature-gates-foo.d.ts"],
      "interface typings were generated"
    );

    // Check the interfaces file for the right exports
    const interfaces = Buffer.from(
      files["interfaces/test-feature-gates-foo.d.ts"]
    ).toString("utf8");
    assert.ok(
      interfaces.includes("export function a(): void;"),
      "unconstrained export foo/a is present"
    );
    assert.ok(
      interfaces.includes("export function b(): void;"),
      "@since(0.2.1) export foo/b is present (version matches)"
    );
    assert.ok(
      interfaces.includes("export function c(): void;"),
      "@since(0.2.1) export foo/c is present (feature is ignored)"
    );
    assert.ok(
      interfaces.includes("export function d(): void;"),
      "@unstable(...) export is present, with all features enabled"
    );
  });

  // (transpile): features marked @unstable shoudl be present in exports when all features are enabled
  //
  // NOTE: this works primarily the features are fed through to the `wit_parser::Resolve` that is used,
  // not due to active filtering on the jco side.
  test("Feature gates (all features enabled)", async () => {
    // Build a dummy WIT component
    const generatedComponent = await componentEmbed({
      witSource: featureGatesWitContent,
      dummy: true,
      metadata: [
        ["language", [["javascript", ""]]],
        ["processed-by", [["dummy-gen", "test"]]],
      ],
      features: { tag: "all" },
    });
    const component = await componentNew(generatedComponent);

    // Transpile the component
    const { files, imports, exports } = await transpile(component);
    assert.deepStrictEqual(imports, ["test:feature-gates/foo"]);
    assert.deepStrictEqual(exports, [
      ["foo", "instance"],
      ["test:feature-gates/foo@0.2.1", "instance"],
    ]);
    assert.ok(files["component.js"], "component js was generated");
    assert.ok(files["component.d.ts"], "component typings were generated");
    assert.ok(
      files["interfaces/test-feature-gates-foo.d.ts"],
      "interface typings were generated"
    );

    // Check the interfaces file for the right exports
    const interfaces = Buffer.from(
      files["interfaces/test-feature-gates-foo.d.ts"]
    ).toString("utf8");
    assert.ok(
      interfaces.includes("export function a(): void;"),
      "unconstrained export foo/a is present"
    );
    assert.ok(
      interfaces.includes("export function b(): void;"),
      "@since(0.2.1) export foo/b is present (version matches)"
    );
    assert.ok(
      interfaces.includes("export function c(): void;"),
      "@since(0.2.1) export foo/c is present (feature is ignored)"
    );
    assert.ok(
      interfaces.includes("export function d(): void;"),
      "@unstable(...) export is present, with all features enabled"
    );
  });

  // (`jco types`) features marked @unstable() are missing as imports *and* exports
  test("Feature gates - (types, no features enabled)", async () => {
    const files = await types(featureGatesWitPath, {
      worldName: "import-and-export",
    });
    assert.ok(files["import-and-export.d.ts"], "component js was generated");
    assert.ok(
      files["interfaces/test-feature-gates-foo.d.ts"],
      "interface typings were generated"
    );

    const imports = Buffer.from(files["import-and-export.d.ts"]).toString(
      "utf8"
    );

    // Check the interfaces file for the right exports
    const interfaces = Buffer.from(
      files["interfaces/test-feature-gates-foo.d.ts"]
    ).toString("utf8");
    assert.ok(
      interfaces.includes("export function a(): void;"),
      "unconstrained export foo/a is present"
    );
    assert.ok(
      interfaces.includes("export function b(): void;"),
      "@since(0.2.1) export foo/b is present (version matches)"
    );
    assert.ok(
      interfaces.includes("export function c(): void;"),
      "@since(0.2.1) export foo/c is present (feature is ignored)"
    );
    assert.ok(
      !interfaces.includes("export function d(): void;"),
      "@unstable(...) export is missing (no features enabled)"
    );
  });

  // (`jco types`) features marked @unstable(feature = f) should be present when the specific feature is enabled
  test("Feature gates (types, single feature enabled)", async () => {
    const files = await types(featureGatesWitPath, {
      worldName: "import-and-export",
      feature: ["fancier-foo"],
    });
    assert.ok(files["import-and-export.d.ts"], "component js was generated");
    assert.ok(
      files["interfaces/test-feature-gates-foo.d.ts"],
      "interface typings were generated"
    );

    // Check the interfaces file for the right exports
    const interfaces = Buffer.from(
      files["interfaces/test-feature-gates-foo.d.ts"]
    ).toString("utf8");
    assert.ok(
      interfaces.includes("export function a(): void;"),
      "unconstrained export foo/a is present"
    );
    assert.ok(
      interfaces.includes("export function b(): void;"),
      "@since(0.2.1) export foo/b is present (version matches)"
    );
    assert.ok(
      interfaces.includes("export function c(): void;"),
      "@since(0.2.1) export foo/c is present (feature is ignored)"
    );
    assert.ok(
      interfaces.includes("export function d(): void;"),
      "@unstable(...) export is present (single feature enabled)"
    );
  });

  // (`jco types`) features marked @unstable() should be present with all features enabled
  test("Feature gates (types, all features enabled)", async () => {
    const files = await types(featureGatesWitPath, {
      worldName: "import-and-export",
      allFeatures: true,
    });
    assert.ok(files["import-and-export.d.ts"], "component js was generated");
    assert.ok(
      files["interfaces/test-feature-gates-foo.d.ts"],
      "interface typings were generated"
    );

    // Check the interfaces file for the right exports
    const interfaces = Buffer.from(
      files["interfaces/test-feature-gates-foo.d.ts"]
    ).toString("utf8");
    assert.ok(
      interfaces.includes("export function a(): void;"),
      "unconstrained export foo/a is present"
    );
    assert.ok(
      interfaces.includes("export function b(): void;"),
      "@since(0.2.1) export foo/b is present (version matches)"
    );
    assert.ok(
      interfaces.includes("export function c(): void;"),
      "@since(0.2.1) export foo/c is present (feature is ignored)"
    );
    assert.ok(
      interfaces.includes("export function d(): void;"),
      "@unstable(...) export is present (all features enabled)"
    );
  });
});
