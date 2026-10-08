declare module "*.wasm" {
    function instantiate(): Record<string, any>;
    function instantiate(
        getCoreModule: (url: URL) => WebAssembly.Module | Promise<WebAssembly.Module>,
        imports: Record<string, any>,
        instantiateCore?: (
            module: WebAssembly.Module,
            imports: Record<string, any>,
        ) => WebAssembly.Instance | Promise<WebAssembly.Instance>,
        options?: { shim?: { globals?: { WebAssembly?: typeof WebAssembly } } },
    ): any | Promise<any>;
    export default instantiate;
}

declare module "*.wasm?component" {
    function instantiate(): Record<string, any>;
    function instantiate(
        getCoreModule: (url: URL) => WebAssembly.Module | Promise<WebAssembly.Module>,
        imports: Record<string, any>,
        instantiateCore?: (
            module: WebAssembly.Module,
            imports: Record<string, any>,
        ) => WebAssembly.Instance | Promise<WebAssembly.Instance>,
        options?: { shim?: { globals?: { WebAssembly?: typeof WebAssembly } } },
    ): any | Promise<any>;
    export default instantiate;
}
