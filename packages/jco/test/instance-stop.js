/** Exercise instance cleanup and task lifecycle through generated bindings and isolated processes. */
import { readFile } from "node:fs/promises";
import { env } from "node:process";

import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";
import { assert, suite, test } from "vitest";

import { parse } from "../src/api.js";
import { $init, generate } from "../obj/js-component-bindgen-component.js";

/** Locate components built from crates/test-components alongside the transpiler fixtures. */
function rustComponent(name) {
    return new URL(`../../jco-transpile/test/fixtures/generated/rust-test-components/${name}.wasm`, import.meta.url);
}

/** Transpile a Rust component, or a focused canonical ABI regression written in WAT. */
async function generated(wat) {
    await $init;
    const { files } = generate(wat instanceof URL ? await readFile(wat) : await parse(wat), {
        name: "component",
        instantiation: { tag: "async" },
        noTypescript: true,
        cmRuntimeEsModule:
            env.JCO_TEST_RUNTIME === "external"
                ? new URL("../../jco-cm-runtime/dist/", import.meta.url).href
                : undefined,
        map: [],
    });
    return files;
}

/** `instantiate` for `wat`: each call makes a new instance of one transpiled module. */
async function transpiled(wat) {
    let source;
    const modules = new Map();
    for (const [name, bytes] of await generated(wat)) {
        if (name.endsWith(".wasm")) {
            modules.set(name, WebAssembly.compile(bytes));
        } else if (name.endsWith(".js")) {
            source = Buffer.from(bytes).toString("base64");
        }
    }
    const { instantiate } = await import(`data:text/javascript;base64,${source}`);
    return (imports, options, instantiateCore) =>
        instantiate(
            (name) => modules.get(name),
            { ...new WASIShim().getImportObject(), ...imports },
            instantiateCore,
            options,
        );
}

/** A host object that counts how often it is disposed. */
function things() {
    const disposed = new Map();
    class Thing {
        [Symbol.dispose]() {
            disposed.set(this, (disposed.get(this) ?? 0) + 1);
        }
    }
    return { Thing, disposed };
}

/** No async at all: what a guest holds, drops or is lent is up to which export it is given to. */
const SYNC_THINGS = rustComponent("instance-stop-resources");

suite("stopping an instance", () => {
    test.concurrent("each host object is disposed once, and what was only lent is not", async () => {
        const instantiate = await transpiled(SYNC_THINGS);
        const { Thing, disposed } = things();
        const instance = await instantiate({
            "jco:test-components/instance-stop-host": { Thing, stop() {}, destroyed() {} },
        });

        const held = new Thing();
        instance.hold(held);
        const dropped = new Thing();
        instance.drop(dropped);
        assert.strictEqual(disposed.get(dropped), 1, "jco disposes what a guest drops");
        // A guest holds it twice, and drops it once: jco disposes it.
        const twice = new Thing();
        instance.hold(twice);
        instance.drop(twice);
        assert.strictEqual(disposed.get(twice), 1);
        const lent = new Thing();
        instance.borrow(lent);

        instance._util.stop();
        assert.strictEqual(disposed.get(held), 1);
        assert.strictEqual(disposed.get(dropped), 1);
        assert.strictEqual(disposed.get(twice), 1);
        assert.isFalse(disposed.has(lent), "the host still owns what it lent");

        instance._util.stop();
        assert.strictEqual(disposed.get(held), 1);
    });
});
