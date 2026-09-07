import { describe, expect, test } from "vitest";

import { createProxySource } from "../src/plugin.js";

describe("component proxy source", () => {
    test("keeps eager named exports and defaults the lifecycle facade", () => {
        const source = createProxySource(JSON.stringify("\0generated"), undefined, ["add"]);

        expect(source).toContain("import * as component");
        expect(source).toContain("export *");
        expect(source).toContain("export default function instantiate");
        expect(source).toContain("return component");
    });

    test.each(["async", "sync"] as const)("generates live named exports in %s mode", (mode) => {
        const source = createProxySource(JSON.stringify("\0generated"), mode, ["run", "instantiate"]);

        expect(source).toContain("import { instantiate as generatedInstantiate }");
        expect(source).toContain('export { componentExport0 as "run" }');
        expect(source).toContain('export { componentExport1 as "instantiate" }');
        expect(source).toContain("export default function instantiate");
        expect(source).not.toContain("export *");
    });

    test("keeps a component export named instantiate separate from the lifecycle function", async () => {
        const generated = moduleUrl(`
            export async function instantiate(_getCoreModule, imports) {
                if (!imports.ready) throw new Error("missing import");
                return {
                    instantiate() { return "component export"; },
                    value: imports.value,
                };
            }
        `);
        const facade = await import(
            moduleUrl(createProxySource(JSON.stringify(generated), "async", ["instantiate", "value"]))
        );

        await expect(facade.default(null, {})).rejects.toThrow("missing import");
        expect(facade.instantiate).toBeUndefined();
        expect(facade.value).toBeUndefined();

        const instance = await facade.default(null, { ready: true, value: 42 });
        expect(facade.value).toBe(42);
        expect(facade.instantiate()).toBe("component export");
        expect(facade.instantiate).not.toBe(facade.default);
        expect(instance.instantiate).toBe(facade.instantiate);
        expect(() => facade.default(null, { ready: true })).toThrow(/already been instantiated/);
    });

    test("returns the component instance synchronously in sync mode", async () => {
        const generated = moduleUrl(`
            export function instantiate(_getCoreModule, imports) {
                return { value: imports.value };
            }
        `);
        const facade = await import(moduleUrl(createProxySource(JSON.stringify(generated), "sync", ["value"])));

        const instance = facade.default(null, { value: 42 });
        expect(instance).not.toBeInstanceOf(Promise);
        expect(instance.value).toBe(42);
        expect(facade.value).toBe(42);
    });
});

function moduleUrl(source: string): string {
    return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}
