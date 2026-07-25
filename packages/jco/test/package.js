import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import packageJson from "../package.json" with { type: "json" };
import { describe, expect, test } from "vitest";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("package output", () => {
    test("all public runtime and declaration targets are generated", async () => {
        const targets = [
            packageJson.bin.jco,
            packageJson.main,
            packageJson.types,
            packageJson.exports["."].types,
            packageJson.exports["."].browser,
            packageJson.exports["."].default,
            packageJson.exports["./component"].types,
            packageJson.exports["./component"].default,
            packageJson.imports["#ora"].types,
            packageJson.imports["#ora"].browser,
        ];

        await Promise.all(targets.map((target) => access(resolve(packageDir, target))));
    });

    test("does not publish authored sources or manually maintained declarations", () => {
        expect(packageJson.files).not.toContain("src");
        expect(packageJson.files).not.toContain("types");
    });
});
