import vm, { Script, compileFunction, runInThisContext, constants } from "node:vm";
import * as namespace from "node:vm";

function failure(operation) {
    try {
        operation();
    } catch (error) {
        return { name: error.name, code: error.code };
    }

    throw new Error("Expected a controlled VM error");
}

export function run() {
    const script = new Script("globalThis.__vmGuestCounter += 1", "counter.js");

    globalThis.__vmGuestCounter = 0;

    try {
        const first = script.runInThisContext();
        const second = script.runInThisContext();
        const fn = compileFunction("const result = left + right; return result", ["left", "right"]);

        const callable = runInThisContext("(value => value * 2)");
        const object = runInThisContext("({ answer: 42 })");

        const metadata = new Script("42\n//# sourceMappingURL=answer.map");
        const untouched = new Proxy(
            {},
            {
                get() {
                    throw new Error("argument touched");
                },
            },
        );

        return JSON.stringify({
            identity: vm.Script === Script && namespace.default === vm && vm.constants === constants,
            exports: Object.keys(vm).sort(),
            execution: [first, second, fn(20, 22), callable(21), object.answer],
            global: runInThisContext("globalThis") === globalThis,
            local: runInThisContext("{ let value = 21; value * 2; }"),
            metadata: metadata.sourceMapURL,
            context: vm.isContext({}),
            constants: Object.isFrozen(constants) && Object.getPrototypeOf(constants) === null,
            failures: {
                syntax: failure(() => new Script("return 1")),
                input: failure(() => compileFunction(42)),
                context: failure(() => vm.createContext(untouched)),
                runContext: failure(() => vm.runInContext(untouched, untouched)),
                runNew: failure(() => vm.runInNewContext(untouched)),
                scriptContext: failure(() => script.runInContext(untouched)),
                scriptNew: failure(() => script.runInNewContext(untouched)),
                cache: failure(() => script.createCachedData()),
                memory: failure(() => vm.measureMemory(untouched)),
                module: failure(() => new vm.Module(untouched)),
                sourceModule: failure(() => new vm.SourceTextModule(untouched)),
                syntheticModule: failure(() => new vm.SyntheticModule(untouched, untouched)),
                timeout: failure(() => runInThisContext("throw 1", { timeout: 1 })),
                declaration: failure(() => runInThisContext("throw 1; let value = 1")),
                loader: failure(() => compileFunction("return import('example')")),
                deprecated: failure(() => new Script(untouched, { produceCachedData: true })),
            },
        });
    } finally {
        delete globalThis.__vmGuestCounter;
    }
}
