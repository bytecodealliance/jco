import { describe, expect, test } from "vitest";

import { createProxySource } from "../src/plugin.js";

describe("component proxy source", () => {
    test("keeps eager component exports in the component namespace", () => {
        const source = createProxySource(JSON.stringify("\0generated"), undefined);

        expect(source).toContain("import * as component");
        expect(source).toContain("export { component }");
        expect(source).toContain("export default component");
        expect(source).not.toContain("export *");
        expect(source).not.toContain("export function instantiate");
    });

    test.each(["async", "sync"] as const)("reserves the top-level instantiate export in %s mode", (mode) => {
        const source = createProxySource(JSON.stringify("\0generated"), mode);

        expect(source).toContain("import { instantiate as generatedInstantiate }");
        expect(source).toContain("export { component }");
        expect(source).toContain("export default component");
        expect(source).toContain("export function instantiate");
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
        const facade = await import(moduleUrl(createProxySource(JSON.stringify(generated), "async")));

        await expect(facade.instantiate(null, {})).rejects.toThrow("missing import");
        expect(Object.keys(facade.component)).toEqual([]);

        const instance = await facade.instantiate(null, { ready: true, value: 42 });
        expect(instance).toBe(facade.default);
        expect(instance).toBe(facade.component);
        expect(facade.component.value).toBe(42);
        expect(facade.component.instantiate()).toBe("component export");
        expect(facade.component.instantiate).not.toBe(facade.instantiate);
        expect(() => facade.instantiate(null, { ready: true })).toThrow(/already been instantiated/);
    });

    test("returns the stable component object synchronously in sync mode", async () => {
        const generated = moduleUrl(`
            export function instantiate(_getCoreModule, imports) {
                return { value: imports.value };
            }
        `);
        const facade = await import(moduleUrl(createProxySource(JSON.stringify(generated), "sync")));

        const instance = facade.instantiate(null, { value: 42 });
        expect(instance).toBe(facade.component);
        expect(instance).not.toBeInstanceOf(Promise);
        expect(facade.default.value).toBe(42);
    });
});

function moduleUrl(source: string): string {
    return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}
