/**
 * `node:ffi`, backed by a host capability.
 *
 * Note the path: this entry point lives under **`node/26.x.x`**, not `24.x.x`, because `node:ffi`
 * does not exist in Node 24. It arrived in Node 26.1.0 at Stability 1 and still requires
 * `--experimental-ffi` as of 26.8.1. It is the first module where the Node major in the entry path
 * carries real meaning rather than being a formality.
 *
 * WASI has no dynamic loader and a component has no host address space, so unlike `node:path` this
 * cannot be a portable shim: the host owns a real `node:ffi` and this module forwards to it, the
 * way `node:child_process` and `node:cluster` do. **Access is denied by default** -- declaring the
 * WIT import grants nothing, and an application opts in at transpile time with `--map`.
 *
 * That default is not ceremony. Granting this capability lets a guest load native libraries and
 * read and write arbitrary host memory, which is strictly more power than any other Node builtin
 * Jco supports.
 *
 * Three parts of Node's surface are refused rather than forwarded, because a component cannot
 * express them and a silently wrong answer would be worse than an error:
 *
 * - `getRawPointer()` -- guest memory has no host address.
 * - `registerCallback()` and its ref-counting companions -- the host cannot call back into the guest.
 * - `toBuffer(p, n, false)` / `toArrayBuffer(p, n, false)` -- a live view into host memory. Omit the
 *   argument for the copy Node returns by default.
 *
 * Buffer-shaped *arguments* are refused for the same reason, at the point a signature declares
 * one. Pass a `pointer` and use `toBuffer`/`exportBuffer`, which copy explicitly.
 */

import * as host from "jco:node/ffi@0.1.0";

import { createFfi } from "./ffi/index.js";

/**
 * Node's platform suffix, as a live binding the host fills in.
 *
 * It cannot be read at module load: a component's top-level code runs under Wizer, which refuses
 * imported calls outright ("You cannot call arbitrary imported functions during Wizer
 * initialization"). So it is seeded with the Unix convention and replaced the first time the guest
 * touches the host -- or on the first read of `ffi.suffix`, which syncs before answering.
 *
 * The one stale window is a destructured `import { suffix }` read before any FFI call, which is
 * also the documented ``dlopen(`./lib.${suffix}`)`` idiom. Set it host-side with the Node adapter's
 * `setSuffix()` when serving a guest that names `.dylib` or `.dll`.
 *
 * TODO(ffi): the real fix is build-time -- inline the target's suffix during componentization,
 * which sidesteps the initialization-time call entirely.
 */
export let suffix = "so";

let suffixSynced = false;

/** Pick up the host's suffix, once, the first time the boundary is crossed. */
function syncSuffix(): void {
  if (suffixSynced) {
    return;
  }
  suffixSynced = true;
  try {
    suffix = host.suffix();
  } catch {
    // A host that grants nothing keeps the seeded default; the refusal belongs to the call the
    // guest actually made, not to reading a string.
  }
}

const ffi = createFfi(host, syncSuffix);

export { types } from "./ffi/index.js";
export { ADAPTER_REQUIRED_CODE, UNSUPPORTED_CODE } from "./ffi/index.js";
export type {
  Definitions,
  DlopenResult,
  DynamicLibraryLike,
  NativeFunction,
  Signature,
  TypeName,
} from "./ffi/index.js";

export const DynamicLibrary = ffi.DynamicLibrary;
export const dlopen = ffi.dlopen;
export const dlclose = ffi.dlclose;
export const dlsym = ffi.dlsym;
export const toString = ffi.toString;
export const toBuffer = ffi.toBuffer;
export const toArrayBuffer = ffi.toArrayBuffer;
export const getRawPointer = ffi.getRawPointer;
export const getCurrentEventLoop = ffi.getCurrentEventLoop;
export const exportString = ffi.exportString;
export const exportBuffer = ffi.exportBuffer;
export const exportArrayBuffer = ffi.exportArrayBuffer;
export const exportArrayBufferView = ffi.exportArrayBufferView;
export const getInt8 = ffi.getInt8;
export const getUint8 = ffi.getUint8;
export const getInt16 = ffi.getInt16;
export const getUint16 = ffi.getUint16;
export const getInt32 = ffi.getInt32;
export const getUint32 = ffi.getUint32;
export const getInt64 = ffi.getInt64;
export const getUint64 = ffi.getUint64;
export const getFloat32 = ffi.getFloat32;
export const getFloat64 = ffi.getFloat64;
export const setInt8 = ffi.setInt8;
export const setUint8 = ffi.setUint8;
export const setInt16 = ffi.setInt16;
export const setUint16 = ffi.setUint16;
export const setInt32 = ffi.setInt32;
export const setUint32 = ffi.setUint32;
export const setInt64 = ffi.setInt64;
export const setUint64 = ffi.setUint64;
export const setFloat32 = ffi.setFloat32;
export const setFloat64 = ffi.setFloat64;

import { types as typeNames } from "./ffi/index.js";

/** The module object, matching what `require("node:ffi")` yields. */
const ffiModule = {
  ...ffi,
  types: typeNames,
  // A getter, so reading it syncs from the host first and agrees with the named export above.
  get suffix(): string {
    syncSuffix();
    return suffix;
  },
};

export default ffiModule;
