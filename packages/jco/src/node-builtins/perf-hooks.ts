import { type BuiltinContext, type BuiltinAdapter, builtin, stdModule } from "./shared.js";

/** Source of the capability-free `node:perf_hooks` ESM facade. */
function perfHooksAdapter(perfHooksModule: string): string {
    return `
export { default } from ${JSON.stringify(perfHooksModule)};
export * from ${JSON.stringify(perfHooksModule)};
`;
}

export function createPerfHooksBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return builtin("node:perf_hooks", () => perfHooksAdapter(stdModule(options.perfHooksModule, "perf-hooks")));
}
