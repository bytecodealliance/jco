import {
    VIRTUAL_PREFIX,
    type BuiltinContext,
    type BuiltinAdapter,
    composeBuiltins,
    builtin,
    virtualBuiltin,
} from "./shared.js";
import { type NodeBuiltinOptions } from "./types.js";
import { unenvModule } from "./unenv.js";

export const UNENV_BUFFER_CORE = `${VIRTUAL_PREFIX}unenv-buffer-core`;

function unenvBufferCore(options: NodeBuiltinOptions): string {
    // Implementation source: unenv@2.0.0-rc.24's
    // runtime/node/internal/buffer/buffer module, which wraps the MIT-licensed
    // Feross buffer implementation. Node-facing constants and the public export
    // shape follow Node.js v24 lib/buffer.js.
    const bufferModule = unenvModule("unenv:buffer-core", options);
    return `
import {
    Buffer as UnenvBuffer,
    INSPECT_MAX_BYTES,
    kMaxLength,
} from ${JSON.stringify(bufferModule)};
function deprecatedBufferConstructor() {
    const error = new Error("The deprecated Buffer() constructor is not supported; use Buffer.alloc(), Buffer.allocUnsafe(), or Buffer.from() instead");
    error.code = "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API";
    throw error;
}
function unsupported(api) {
    const error = new Error(api + " is not supported by the Jco component runtime");
    error.code = "ERR_JCO_UNSUPPORTED_NODE_API";
    throw error;
}
export const Buffer = new Proxy(UnenvBuffer, {
    apply: deprecatedBufferConstructor,
    construct: deprecatedBufferConstructor,
});
Buffer.prototype.constructor = Buffer;
// TypedArray-derived methods must allocate through the upstream implementation,
// not the deprecated-constructor guard exposed to users.
Object.defineProperty(Buffer, Symbol.species, { value: UnenvBuffer });
export const SlowBuffer = new Proxy(function SlowBuffer() {}, {
    apply: deprecatedBufferConstructor,
    construct: deprecatedBufferConstructor,
});
export const Blob = globalThis.Blob ?? class Blob {
    constructor() { unsupported("buffer.Blob"); }
};
export const File = globalThis.File ?? class File {
    constructor() { unsupported("buffer.File"); }
};
export { INSPECT_MAX_BYTES, kMaxLength };
export const kStringMaxLength = 536870888;
export const constants = {
    MAX_LENGTH: Number.MAX_SAFE_INTEGER,
    MAX_STRING_LENGTH: kStringMaxLength,
};
export const atob = globalThis.atob?.bind(globalThis) ?? ((value) => UnenvBuffer.from(value, "base64").toString("latin1"));
export const btoa = globalThis.btoa?.bind(globalThis) ?? ((value) => UnenvBuffer.from(value, "latin1").toString("base64"));
export const isAscii = () => unsupported("buffer.isAscii");
export const isUtf8 = () => unsupported("buffer.isUtf8");
export const resolveObjectURL = () => unsupported("buffer.resolveObjectURL");
export const transcode = () => unsupported("buffer.transcode");
globalThis.Buffer = Buffer;
export default {
    atob,
    Blob,
    Buffer,
    btoa,
    constants,
    File,
    INSPECT_MAX_BYTES,
    isAscii,
    isUtf8,
    kMaxLength,
    kStringMaxLength,
    resolveObjectURL,
    SlowBuffer,
    transcode,
};
`;
}

function bufferAdapter(): string {
    return `
export { default } from ${JSON.stringify(UNENV_BUFFER_CORE)};
export * from ${JSON.stringify(UNENV_BUFFER_CORE)};
`;
}

export function createBufferBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return composeBuiltins([
        builtin("node:buffer", bufferAdapter),
        virtualBuiltin(UNENV_BUFFER_CORE, UNENV_BUFFER_CORE, () => unenvBufferCore(options)),
    ]);
}
