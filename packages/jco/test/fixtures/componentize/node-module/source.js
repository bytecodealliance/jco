import nodeModule, { SourceMap, builtinModules, createRequire, isBuiltin } from "node:module";

/** Call something expected to refuse, and report the code it refused with. */
function refusal(call) {
    try {
        call();
        return "DID NOT THROW";
    } catch (error) {
        return error.code ?? error.name;
    }
}

const PAYLOAD = {
    version: 3,
    file: "out.js",
    sources: ["a.ts", "b.ts"],
    names: ["alpha", "beta"],
    mappings: "AAAA,SAASA;AACT,ICAAC",
};

export function run() {
    // A require that is created but whose loading half refuses.
    const require = createRequire("/app/index.js");

    const map = new SourceMap(PAYLOAD);

    return JSON.stringify({
        // Classification: pure data, exact.
        moduleIsClass: nodeModule === nodeModule.Module,
        builtinCount: builtinModules.length,
        isBuiltinFs: isBuiltin("node:fs"),
        isBuiltinBareTest: isBuiltin("test"),
        isBuiltinPrefixedTest: isBuiltin("node:test"),

        // Source maps: real arithmetic, no loader involved.
        entry: map.findEntry(0, 10),
        origin: map.findOrigin(2, 5),
        wrapped: nodeModule.wrap("const a = 1;"),

        // State reporting, accurate rather than stubbed.
        sourceMapsSupport: nodeModule.getSourceMapsSupport(),
        compileCacheStatus: nodeModule.enableCompileCache().status,
        globalPaths: nodeModule.globalPaths,

        // require: created fine, resolves builtins, refuses to load.
        resolvesBuiltin: require.resolve("node:path"),
        resolveMissing: refusal(() => require.resolve("lodash")),
        requiring: refusal(() => require("node:path")),

        // The loading half.
        register: refusal(() => nodeModule.register("./hooks.js")),
        runMain: refusal(() => nodeModule.runMain()),
        stripTypes: refusal(() => nodeModule.stripTypeScriptTypes("const x: number = 1;")),
        moduleRequire: refusal(() => new nodeModule.Module("x").require("node:path")),
    });
}
