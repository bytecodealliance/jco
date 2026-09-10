import { type BuiltinContext, type BuiltinAdapter, builtin, stdModule } from "./shared.js";
import { FFI_WIT_REQUIREMENT } from "../node-wit.js";

const FFI_SPECIFIER = "node:ffi";

/**
 * Source of the `node:ffi` adapter.
 *
 * Host-backed, like `node:child_process`: WASI has no dynamic loader and a component has no host
 * address space, so the jco-std module imports the WIT interface itself and this adapter only has
 * to re-export Node's module shape.
 *
 * Note the module this resolves to lives under `node/26.x.x`: `node:ffi` does not exist in Node 24.
 */
function ffiAdapter(ffiModule: string): string {
    return `
import ffi from ${JSON.stringify(ffiModule)};
export default ffi;
export {
    DynamicLibrary,
    dlclose,
    dlopen,
    dlsym,
    exportArrayBuffer,
    exportArrayBufferView,
    exportBuffer,
    exportString,
    getCurrentEventLoop,
    getFloat32,
    getFloat64,
    getInt16,
    getInt32,
    getInt64,
    getInt8,
    getRawPointer,
    getUint16,
    getUint32,
    getUint64,
    getUint8,
    setFloat32,
    setFloat64,
    setInt16,
    setInt32,
    setInt64,
    setInt8,
    setUint16,
    setUint32,
    setUint64,
    setUint8,
    suffix,
    toArrayBuffer,
    toBuffer,
    toString,
    types,
} from ${JSON.stringify(ffiModule)};
`;
}

export function createFfiBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return builtin(
        FFI_SPECIFIER,
        () => ffiAdapter(stdModule(options.ffiModule, "ffi", "26.x.x")),
        () => options.onWitRequirement?.(FFI_WIT_REQUIREMENT),
    );
}
