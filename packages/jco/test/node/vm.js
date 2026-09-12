import { expect, test, vi } from "vitest";
import { nodeBuiltinPlugin } from "../../src/node-builtins/index.js";
import { componentizeFixture, transpileComponent } from "../helpers.js";

test("node:vm resolves lazily with no WIT capabilities or bare aliases", () => {
    const onWitRequirement = vi.fn();
    const plugin = nodeBuiltinPlugin({ imports: [], exports: [] }, { vmModule: "/test/vm.js", onWitRequirement });

    expect(plugin.resolveId("vm")).toBeNull();
    expect(plugin.resolveId("node:vm/unknown")).toBeNull();
    expect(plugin.resolveId("node:vm")).toBe("\0jco-node-builtin:node:vm");
    expect(plugin.load("\0jco-node-builtin:node:vm")).toContain('from "/test/vm.js"');
    expect(onWitRequirement).not.toHaveBeenCalled();
});

test.each(["starlingmonkey", "quickjs"])(
    "node:vm executes in %s with ordinary imports and no host provider",
    async (backend) => {
        const { componentPath, stderr } = await componentizeFixture({
            fixture: "node-vm",
            entry: "source.js",
            wit: "source.wit",
            world: "test",
            bundle: true,
            copy: true,
            extraArgs: ["--backend", backend],
        });

        expect(stderr).not.toContain("Jco added generated WIT import");

        const { modulePath } = await transpileComponent({ componentPath, name: `vm-${backend}` });
        const component = await import(modulePath);
        const report = JSON.parse(component.run());

        expect(report.identity).toBe(true);
        expect(report.exports).toEqual([
            "Module",
            "Script",
            "SourceTextModule",
            "SyntheticModule",
            "compileFunction",
            "constants",
            "createContext",
            "createScript",
            "isContext",
            "measureMemory",
            "runInContext",
            "runInNewContext",
            "runInThisContext",
        ]);
        expect(report.execution).toEqual([1, 2, 42, 42, 42]);
        expect(report.global).toBe(true);
        expect(report.local).toBe(42);
        expect(report.metadata).toBe("answer.map");
        expect(report.context).toBe(false);
        expect(report.constants).toBe(true);
        expect(report.failures.syntax).toEqual({ name: "SyntaxError" });
        expect(report.failures.input).toEqual({ name: "TypeError", code: "ERR_INVALID_ARG_TYPE" });
        expect(report.failures.deprecated).toEqual({ name: "Error", code: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API" });

        for (const [name, result] of Object.entries(report.failures)) {
            if (!["syntax", "input", "deprecated"].includes(name)) {
                expect(result, name).toEqual({ name: "Error", code: "ERR_JCO_UNSUPPORTED_NODE_API" });
            }
        }

        expect(JSON.parse(component.run())).toEqual(report);
    },
    180_000,
);
