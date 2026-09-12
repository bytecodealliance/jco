// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// Adapted from nodejs/node v24.19.0, commit
// cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, lib/wasi.js, with `validateUndefined`
// from lib/internal/validators.js (the rest come from ../internal/validation.js). Local changes: TypeScript types;
// primordials replaced; the `wasi` internal binding becomes the
// `jco:node/wasi` provider, which can only *initialise* a context (the
// constructor's `uvwasi_init` step). Binding a memory is refused, see
// `setMemory` below, so `start()` and `initialize()` never run a module; the
// `wasiImport` table is present with Node's names and arities and raises
// `ERR_WASI_NOT_STARTED` as Node's does before `start()`. The experimental
// warning Node emits on load is not emitted.

import { codedError, invalidArgType, invalidArgValue, unsupportedNodeApi } from "../errors/core.js";
import {
  validateArray,
  validateBoolean,
  validateFunction,
  validateInteger,
  validateObject,
  validateString,
} from "../internal/validation.js";
import { callHost, decodeErrno } from "../internal/host-error.js";
import { PREVIEW1_SYSCALLS, type Preview1Syscall, type SyscallParameter } from "./syscalls.js";
import type {
  FinalizeBindingsOptions,
  WASI as WasiInterface,
  WASIConstructor,
  WASIOptions,
  WasiBindingName,
  WasiError,
  WasiHostOptions,
  WasiImport,
  WasiImportObject,
  WasiInstance,
  WasiModule,
  WasiProvider,
  WasiResult,
  WasiSyscall,
  WasiVersion,
} from "./types.js";

const kExitCode: unique symbol = Symbol("kExitCode");
const kSetMemory: unique symbol = Symbol("kSetMemory");
const kStarted: unique symbol = Symbol("kStarted");
const kInstance: unique symbol = Symbol("kInstance");
const kBindingName: unique symbol = Symbol("kBindingName");

const kEmptyObject: object = Object.freeze(Object.create(null));

/**
 * Why nothing past construction can work, stated once: this is the reason carried by every
 * `ERR_JCO_UNSUPPORTED_NODE_API` the module raises and appended to the deny provider's refusal.
 */
export const NESTED_INSTANTIATION_UNSUPPORTED =
  "a component cannot instantiate a nested WebAssembly module (the guest engine has no " +
  "WebAssembly global), so there is no instance whose memory wasi.start(), wasi.initialize() " +
  "or wasi.finalizeBindings() could bind, and a memory cannot cross the component boundary to " +
  "a host. Compose the module with the component at build time, for example with wac or " +
  "wasm-tools compose, or run it on the host instead";

function validateUndefined(value: unknown, name: string): asserts value is undefined {
  if (value !== undefined) {
    throw invalidArgType(name, "undefined", value);
  }
}

/** Node's `ERR_WASI_ALREADY_STARTED`. */
function alreadyStarted(): Error {
  return codedError(new Error("WASI instance has already started"), "ERR_WASI_ALREADY_STARTED");
}

/** Node's `ERR_WASI_NOT_STARTED`, raised by every syscall until `start()` binds a memory. */
function notStarted(): Error {
  return codedError(new Error("wasi.start() has not been called"), "ERR_WASI_NOT_STARTED");
}

/** The binding's own memory check, which Node raises without `internal/errors`' "The" prefix. */
function memoryTypeError(): TypeError {
  return codedError(
    new TypeError('"instance.exports.memory" property must be a WebAssembly.Memory object'),
    "ERR_INVALID_ARG_TYPE",
  );
}

/**
 * Stand-in for the binding's `_setMemory`. A memory that is not a `WebAssembly.Memory` is
 * rejected as Node rejects it where that check is possible; a memory that is one, or any value
 * in a guest with no `WebAssembly` global, is refused because it cannot be bound to anything.
 */
function setMemory(memory: unknown): never {
  const wasm = (globalThis as { WebAssembly?: { Memory?: unknown } }).WebAssembly;
  if (typeof wasm?.Memory === "function" && !(memory instanceof wasm.Memory)) {
    throw memoryTypeError();
  }
  throw unsupportedNodeApi(
    "Running a WebAssembly module through node:wasi",
    NESTED_INSTANTIATION_UNSUPPORTED,
  );
}

/**
 * Rebuild the error a provider serialized. A uvwasi failure is a plain `Error` whose own
 * enumerable `errno`, `code` and `syscall` are defined in that order, as the binding sets them.
 */
function providerError(record: WasiError): Error {
  const denied = record.code === "ERR_JCO_WASI_ADAPTER_REQUIRED";
  const message = denied
    ? `${record.message}. Mapping one only makes construction behave as Node's does: ` +
      `running a module through node:wasi is not supported in a WebAssembly component, ` +
      `because ${NESTED_INSTANTIATION_UNSUPPORTED}`
    : record.message;
  const error = new Error(message);
  // Absent optional fields lower as `undefined` or, on the QuickJS backend, `null`.
  const fields: Array<[string, unknown]> = [
    ["errno", decodeErrno(record.errno ?? undefined)],
    ["code", record.code ?? "ERR_JCO_WASI_HOST"],
    ["syscall", record.syscall ?? undefined],
  ];
  for (const [key, value] of fields) {
    if (value !== undefined) {
      Object.defineProperty(error, key, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  }
  return error;
}

/** `UVWASI_EINVAL`, which the binding returns for a call whose arguments it cannot convert. */
const UVWASI_EINVAL = 28;

/** V8's `IsUint32` for a number and `IsBigInt` for the 64-bit parameters. */
function acceptsArgument(parameter: SyscallParameter, value: unknown): boolean {
  if (parameter === "u32") {
    return (
      typeof value === "number" &&
      Number.isInteger(value) &&
      !Object.is(value, -0) &&
      value >= 0 &&
      value <= 0xffff_ffff
    );
  }
  return typeof value === "bigint";
}

/**
 * A syscall with Node's name, arity and pre-start behaviour. The binding checks the argument
 * count and types first and answers `UVWASI_EINVAL` without throwing when they do not match;
 * only a well-formed call reaches the memory, which in a component is never bound. The
 * binding's methods are native, so `wasiImport` carries `Function.prototype.bind` copies named
 * `bound <syscall>`; binding here reproduces both the names and the arities.
 */
function syscall(name: Preview1Syscall, parameters: readonly SyscallParameter[]): WasiSyscall {
  const fn = {
    [name]: function (...args: unknown[]): number {
      if (args.length !== parameters.length) {
        return UVWASI_EINVAL;
      }
      if (!parameters.every((parameter, index) => acceptsArgument(parameter, args[index]))) {
        return UVWASI_EINVAL;
      }
      throw notStarted();
    },
  }[name] as WasiSyscall;
  Object.defineProperty(fn, "length", { value: parameters.length, configurable: true });
  return fn.bind(undefined) as WasiSyscall;
}

/** Create the `node:wasi` module over an explicit initialisation provider. */
export function createWasi(host: WasiProvider): WasiModule {
  const call = <T>(operation: () => T | WasiResult<T>): T => callHost(operation, providerError);

  class WASI implements WasiInterface {
    wasiImport: WasiImport;
    [kBindingName]: WasiBindingName;
    [kSetMemory]: (memory: unknown) => void;
    [kStarted]: boolean;
    [kExitCode]: number;
    [kInstance]: WasiInstance | undefined;

    constructor(options: WASIOptions = kEmptyObject as WASIOptions) {
      validateObject(options, "options");

      validateString(options.version, "options.version");
      let version: WasiVersion;
      switch (options.version) {
        case "unstable":
          version = "unstable";
          this[kBindingName] = "wasi_unstable";
          break;
        case "preview1":
          version = "preview1";
          this[kBindingName] = "wasi_snapshot_preview1";
          break;
        // When adding support for additional wasi versions add case here
        default:
          throw invalidArgValue("options.version", options.version, "unsupported WASI version");
      }

      if (options.args !== undefined) {
        validateArray(options.args, "options.args");
      }
      const args = (options.args || []).map(String);

      const env: [string, string][] = [];
      if (options.env !== undefined) {
        validateObject(options.env, "options.env");
        for (const [key, value] of Object.entries(options.env)) {
          if (value !== undefined) {
            env.push([key, `${value}`]);
          }
        }
      }

      const preopens: [string, string][] = [];
      if (options.preopens !== undefined) {
        validateObject(options.preopens, "options.preopens");
        for (const [key, value] of Object.entries(options.preopens)) {
          preopens.push([String(key), String(value)]);
        }
      }

      const { stdin = 0, stdout = 1, stderr = 2 } = options;
      validateInteger(stdin, "options.stdin", 0, 2147483647);
      validateInteger(stdout, "options.stdout", 0, 2147483647);
      validateInteger(stderr, "options.stderr", 0, 2147483647);

      const initOptions: WasiHostOptions = { version, args, env, preopens, stdin, stdout, stderr };
      call(() => host.init(initOptions));

      const wrap = Object.fromEntries(
        PREVIEW1_SYSCALLS.map(([name, parameters]) => [name, syscall(name, parameters)]),
      ) as WasiImport;

      let returnOnExit = true;
      if (options.returnOnExit !== undefined) {
        validateBoolean(options.returnOnExit, "options.returnOnExit");
        returnOnExit = options.returnOnExit;
      }
      if (returnOnExit) {
        wrap.proc_exit = wasiReturnOnProcExit.bind(this) as WasiSyscall;
      }

      this[kSetMemory] = setMemory;
      this.wasiImport = wrap;
      this[kStarted] = false;
      this[kExitCode] = 0;
      this[kInstance] = undefined;
    }

    finalizeBindings(
      instance: object,
      { memory = exportedMemory(instance) }: FinalizeBindingsOptions = {},
    ): void {
      if (this[kStarted]) {
        throw alreadyStarted();
      }

      validateInstance(instance);

      this[kSetMemory](memory);

      this[kInstance] = instance;
      this[kStarted] = true;
    }

    // Must not export _initialize, must export _start
    start(instance: object): number {
      this.finalizeBindings(instance);

      const { _start, _initialize } = startedExports(this[kInstance]);

      validateFunction(_start, "instance.exports._start");
      validateUndefined(_initialize, "instance.exports._initialize");

      try {
        _start();
      } catch (err) {
        if (err !== kExitCode) {
          throw err;
        }
      }

      return this[kExitCode];
    }

    // Must not export _start, may optionally export _initialize
    initialize(instance: object): void {
      this.finalizeBindings(instance);

      const { _start, _initialize } = startedExports(this[kInstance]);

      validateUndefined(_start, "instance.exports._start");
      if (_initialize !== undefined) {
        validateFunction(_initialize, "instance.exports._initialize");
        _initialize();
      }
    }

    getImportObject(): WasiImportObject {
      return { [this[kBindingName]]: this.wasiImport };
    }
  }

  function wasiReturnOnProcExit(this: WASI, rval: number): never {
    // If __wasi_proc_exit() does not terminate the process, an assertion is
    // triggered in the wasm runtime. Node can sidestep the assertion and return
    // an exit code by recording the exit code, and throwing a JavaScript
    // exception that WebAssembly cannot catch.
    this[kExitCode] = rval;
    throw kExitCode;
  }

  return { WASI: WASI as WASIConstructor };
}

/** The two object checks `finalizeBindings` makes, in Node's order. */
function validateInstance(instance: unknown): asserts instance is WasiInstance {
  validateObject(instance, "instance");
  validateObject(instance.exports, "instance.exports");
}

/** Node's `instance?.exports?.memory` default, evaluated before `instance` is validated. */
function exportedMemory(instance: unknown): unknown {
  return (instance as { exports?: { memory?: unknown } } | null | undefined)?.exports?.memory;
}

/** The exports `finalizeBindings` recorded; it throws before recording any in a component. */
function startedExports(instance: WasiInstance | undefined): WasiInstance["exports"] {
  if (instance === undefined) {
    throw notStarted();
  }
  return instance.exports;
}
