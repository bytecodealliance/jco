/** Create Jco's virtual adapters for supported Node builtins. */
export function nodeBuiltinPlugin(
    worldMetadata: any,
    options?: {},
): {
    name: string;
    resolveId(id: any): any;
    load(id: any): string | null;
};
//# sourceMappingURL=node-builtins.d.ts.map
