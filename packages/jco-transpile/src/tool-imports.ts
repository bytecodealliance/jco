import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

/**
 * Build the WASI imports for one of the vendored tool components.
 *
 * The tools read WIT from host paths, so on Node.js they need the host root.
 * It is mounted on a filesystem private to the tool: the shim's global preopens,
 * which components run by the application see, are neither read nor changed.
 */
export function createToolImports<T>(): T {
    const isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
    const shim = isNode
        ? new WASIShim({ sandbox: { preopens: { '/': process.platform === 'win32' ? '//' : '/' } } })
        : new WASIShim();
    // Generated JS consumes unversioned WASI keys; its declarations retain the
    // versions from the component's WIT imports.
    return shim.getImportObject() as unknown as T;
}

/** Compile a vendored core module from its URL, on Node.js or in a browser. */
export async function compileCoreModule(url: URL): Promise<WebAssembly.Module> {
    if (typeof process !== 'undefined' && process.versions?.node) {
        const { readFile } = await import('node:fs/promises');
        return WebAssembly.compile(await readFile(url));
    }
    return WebAssembly.compileStreaming(fetch(url));
}
