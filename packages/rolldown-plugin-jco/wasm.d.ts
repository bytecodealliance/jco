declare module "*.wasm" {
    const component: any;
    export { component };
    export function instantiate(
        getCoreModule: (url: URL) => WebAssembly.Module | Promise<WebAssembly.Module>,
        imports: Record<string, any>,
        instantiateCore?: (
            module: WebAssembly.Module,
            imports: Record<string, any>,
        ) => WebAssembly.Instance | Promise<WebAssembly.Instance>,
    ): any | Promise<any>;
    export default component;
}

declare module "*.wasm?component" {
    const component: any;
    export { component };
    export function instantiate(
        getCoreModule: (url: URL) => WebAssembly.Module | Promise<WebAssembly.Module>,
        imports: Record<string, any>,
        instantiateCore?: (
            module: WebAssembly.Module,
            imports: Record<string, any>,
        ) => WebAssembly.Instance | Promise<WebAssembly.Instance>,
    ): any | Promise<any>;
    export default component;
}
