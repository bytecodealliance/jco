import { fromHost as errorFromHost, unsupported } from "./errors.js";
import { argumentsToHost, assertCarriable, fromHost, toHost } from "./marshal.js";
import type {
  Definitions,
  DlopenResult,
  DynamicLibraryLike,
  FfiHost,
  NativeFunction,
  FfiModule,
  Signature,
  TypeName,
} from "./types.js";
import { types } from "./types.js";

/** Run a host call, translating whatever it throws into the error a guest should see. */
function through<T>(api: string, call: () => T, onFirstHostCall?: () => void): T {
  onFirstHostCall?.();
  try {
    return call();
  } catch (thrown) {
    throw errorFromHost(api, thrown);
  }
}

/** Node defaults a signature's arguments to `[]` and its return to `void`. */
function normalize(signature: Signature | undefined): {
  args: readonly TypeName[];
  returns: TypeName;
} {
  return {
    args: signature?.arguments ?? [],
    returns: signature?.return ?? types.VOID,
  };
}

/**
 * Build the `node:ffi` module over a host capability.
 *
 * Everything that can cross the boundary is forwarded to the host's real `node:ffi`. What cannot is
 * refused here, guest-side, before any host call -- see `marshal.ts` for why buffer-shaped
 * arguments are among them.
 *
 * @param host - the `jco:node/ffi@0.1.0` capability
 * @param onFirstHostCall - run before the boundary is first crossed. The entry module uses it to
 *   pick up the host's shared-library suffix, which it cannot ask for at module load.
 */
export function createFfi(host: FfiHost, onFirstHostCall?: () => void): FfiModule {
  const reach = <T>(api: string, call: () => T): T => through(api, call, onFirstHostCall);
  class DynamicLibrary implements DynamicLibraryLike {
    readonly path: string;
    readonly symbols: Record<string, bigint> = {};
    /** Host-side handle. `-1` once closed, so a use-after-close is caught before the host sees it. */
    #handle: number;
    readonly #functions: Record<string, NativeFunction> = {};

    constructor(path?: string | null) {
      if (path !== undefined && path !== null && typeof path !== "string") {
        const error = new Error("Library path must be a string or null") as Error & {
          code: string;
        };
        error.code = "ERR_INVALID_ARG_TYPE";
        throw error;
      }
      this.path = path ?? "";
      this.#handle = reach("new ffi.DynamicLibrary()", () => host.open(path ?? undefined));
    }

    /** The handle, refusing once closed the way Node's `ERR_FFI_LIBRARY_CLOSED` does. */
    get #open(): number {
      if (this.#handle < 0) {
        const error = new Error("Library is closed") as Error & { code: string };
        error.code = "ERR_FFI_LIBRARY_CLOSED";
        throw error;
      }
      return this.#handle;
    }

    get functions(): Record<string, NativeFunction> {
      return this.#functions;
    }

    close(): void {
      if (this.#handle < 0) {
        return;
      }
      const handle = this.#handle;
      this.#handle = -1;
      reach("dynamicLibrary.close()", () => host.close(handle));
    }

    getSymbol(name: string): bigint {
      const handle = this.#open;
      const address = reach("dynamicLibrary.getSymbol()", () => host.symbol(handle, name));
      this.symbols[name] = address;
      return address;
    }

    getSymbols(): Record<string, bigint> {
      return this.symbols;
    }

    getFunction(name: string, signature?: Signature): NativeFunction {
      const handle = this.#open;
      const { args, returns } = normalize(signature);
      assertCarriable("dynamicLibrary.getFunction()", [...args, returns]);
      reach("dynamicLibrary.getFunction()", () =>
        host.define(handle, name, { arguments: [...args], returns }),
      );
      const call = (...passed: unknown[]): unknown => {
        const wire = argumentsToHost(`${name}()`, args, passed);
        return fromHost(through(`${name}()`, () => host.call(this.#open, name, wire)));
      };
      Object.defineProperty(call, "name", { configurable: true, value: name });
      this.#functions[name] = call as NativeFunction;
      return call as NativeFunction;
    }

    getFunctions(definitions?: Definitions): Record<string, NativeFunction> {
      for (const [name, signature] of Object.entries(definitions ?? {})) {
        this.getFunction(name, signature);
      }
      return this.#functions;
    }

    // TODO(ffi): callbacks are reachable, just not with this interface shape. The host would need
    // a `callback` resource to own the trampoline's lifetime, plus a guest *export* it can invoke
    // when native code fires -- a resource alone is not enough, since methods only run host-side.
    // `refCallback`/`unrefCallback` then become that resource's ref-counting methods.
    registerCallback(_signature: Signature, _callback: NativeFunction): bigint {
      throw unsupported(
        "dynamicLibrary.registerCallback()",
        "a native callback is a function pointer the host would call back into the guest through, " +
          "and the component boundary cannot carry one",
      );
    }

    unregisterCallback(_pointer: bigint): void {
      throw unsupported(
        "dynamicLibrary.unregisterCallback()",
        "no callback can have been registered",
      );
    }

    refCallback(_pointer: bigint): void {
      throw unsupported("dynamicLibrary.refCallback()", "no callback can have been registered");
    }

    unrefCallback(_pointer: bigint): void {
      throw unsupported("dynamicLibrary.unrefCallback()", "no callback can have been registered");
    }

    [Symbol.dispose](): void {
      this.close();
    }
  }

  function dlopen(path: string, definitions?: Definitions): DlopenResult {
    const lib = new DynamicLibrary(path);
    return { lib, functions: lib.getFunctions(definitions) };
  }

  function dlclose(handle: DynamicLibraryLike): void {
    handle.close();
  }

  function dlsym(handle: DynamicLibraryLike, symbol: string): bigint {
    return handle.getSymbol(symbol);
  }

  /** Build one of Node's ten primitive readers. */
  function reader<T>(api: string, kind: TypeName): (pointer: bigint, offset?: number) => T {
    return (pointer, offset = 0) =>
      fromHost(through(api, () => host.read(pointer, BigInt(offset), kind))) as T;
  }

  /** Build one of Node's ten primitive writers. Node's order is (pointer, offset, value). */
  function writer<T>(
    api: string,
    kind: TypeName,
  ): (pointer: bigint, offset: number, value: T) => void {
    return (pointer, offset, value) => {
      const data = toHost(api, kind, value);
      through(api, () => host.write(pointer, BigInt(offset), kind, data));
    };
  }

  /**
   * Node returns a copy unless `copy` is explicitly false, which asks for a live view.
   *
   * TODO(ffi): a real view needs guest memory and host memory to be the same bytes. See
   * `getRawPointer` below -- the same missing piece unblocks both.
   */
  function assertCopyable(api: string, copy: boolean | undefined): void {
    if (copy === false) {
      throw unsupported(
        `${api} with copy: false`,
        "that asks for a live view into host memory, which a component cannot hold. Omit the " +
          "argument to receive a copy, as Node does by default",
      );
    }
  }

  return {
    DynamicLibrary,
    dlopen,
    dlclose,
    dlsym,

    toString: (pointer: bigint): string | null =>
      reach("ffi.toString()", () => host.readText(pointer)) ?? null,

    toBuffer: (pointer: bigint, length: number, copy?: boolean): Uint8Array => {
      assertCopyable("ffi.toBuffer()", copy);
      return reach("ffi.toBuffer()", () => host.readBytes(pointer, BigInt(length)));
    },

    toArrayBuffer: (pointer: bigint, length: number, copy?: boolean): ArrayBuffer => {
      assertCopyable("ffi.toArrayBuffer()", copy);
      const bytes = reach("ffi.toArrayBuffer()", () => host.readBytes(pointer, BigInt(length)));
      // Hand back a standalone ArrayBuffer rather than the transfer buffer's backing store.
      return bytes.slice().buffer;
    },

    exportString: (value: string, pointer: bigint, length: number, encoding = "utf8"): void => {
      reach("ffi.exportString()", () => host.writeText(pointer, BigInt(length), value, encoding));
    },

    exportBuffer: (buffer: Uint8Array, pointer: bigint, length: number): void => {
      reach("ffi.exportBuffer()", () => host.writeBytes(pointer, BigInt(length), buffer));
    },

    exportArrayBuffer: (arrayBuffer: ArrayBuffer, pointer: bigint, length: number): void => {
      reach("ffi.exportArrayBuffer()", () =>
        host.writeBytes(pointer, BigInt(length), new Uint8Array(arrayBuffer)),
      );
    },

    exportArrayBufferView: (view: ArrayBufferView, pointer: bigint, length: number): void => {
      const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
      reach("ffi.exportArrayBufferView()", () => host.writeBytes(pointer, BigInt(length), bytes));
    },

    getCurrentEventLoop: (): bigint =>
      reach("ffi.getCurrentEventLoop()", () => host.currentEventLoop()),

    /**
     * Refused, and not for want of a host call.
     *
     * This asks for the host address of a JavaScript buffer. Guest memory lives in the component's
     * linear memory, so there is no address to return -- any number would be a lie a native call
     * would then dereference.
     *
     * TODO(ffi): there is a route. A transpiled component's linear memory *is* a host `ArrayBuffer`,
     * so the host could take its base address and add the guest's byte offset. It needs the guest
     * to learn its own offset (componentize-js exposes no such thing today) and it lets native code
     * write straight into linear memory, so it is a deliberate escalation rather than a fill-in.
     */
    getRawPointer: (_source: ArrayBuffer | ArrayBufferView): bigint => {
      throw unsupported(
        "ffi.getRawPointer()",
        "guest memory is not mapped into the host address space, so a component's buffer has no " +
          "host address. Allocate host memory through the library instead and use " +
          "ffi.exportBuffer() to fill it",
      );
    },

    getInt8: reader<number>("ffi.getInt8()", types.INT_8),
    getUint8: reader<number>("ffi.getUint8()", types.UINT_8),
    getInt16: reader<number>("ffi.getInt16()", types.INT_16),
    getUint16: reader<number>("ffi.getUint16()", types.UINT_16),
    getInt32: reader<number>("ffi.getInt32()", types.INT_32),
    getUint32: reader<number>("ffi.getUint32()", types.UINT_32),
    getInt64: reader<bigint>("ffi.getInt64()", types.INT_64),
    getUint64: reader<bigint>("ffi.getUint64()", types.UINT_64),
    getFloat32: reader<number>("ffi.getFloat32()", types.FLOAT_32),
    getFloat64: reader<number>("ffi.getFloat64()", types.FLOAT_64),

    setInt8: writer<number>("ffi.setInt8()", types.INT_8),
    setUint8: writer<number>("ffi.setUint8()", types.UINT_8),
    setInt16: writer<number>("ffi.setInt16()", types.INT_16),
    setUint16: writer<number>("ffi.setUint16()", types.UINT_16),
    setInt32: writer<number>("ffi.setInt32()", types.INT_32),
    setUint32: writer<number>("ffi.setUint32()", types.UINT_32),
    setInt64: writer<bigint>("ffi.setInt64()", types.INT_64),
    setUint64: writer<bigint>("ffi.setUint64()", types.UINT_64),
    setFloat32: writer<number>("ffi.setFloat32()", types.FLOAT_32),
    setFloat64: writer<number>("ffi.setFloat64()", types.FLOAT_64),
  };
}
