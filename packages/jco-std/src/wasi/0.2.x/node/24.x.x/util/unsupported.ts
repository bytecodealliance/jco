import {
  deprecatedNodeApi,
  unsupportedNodeApi,
  invalidArgType,
  outOfRange,
} from "../errors/core.js";
import { parseCallSites } from "../errors/call-site.js";

const warned = new Set<string>();
type WarningProcess = {
  env?: Record<string, string>;
  noDeprecation?: boolean;
  throwDeprecation?: boolean;
  emitWarning?: (message: string, type: string, code?: string) => void;
};
const processInfo = (): WarningProcess | undefined =>
  (globalThis as { process?: WarningProcess }).process;

export function debuglog(section: string, callback?: (fn: (...args: unknown[]) => void) => void) {
  const name = String(section).toUpperCase();
  const enabled = (processInfo()?.env?.NODE_DEBUG ?? "")
    .split(/[\s,]+/)
    .some(
      (pattern) =>
        pattern.length > 0 &&
        new RegExp(
          `^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*")}$`,
          "i",
        ).test(name),
    );
  const logger = Object.assign(
    (...args: unknown[]) => {
      if (enabled) {
        console.error(name, ...args);
      }
    },
    { enabled },
  );
  callback?.(logger);
  return logger;
}

export const debug: typeof debuglog = debuglog;

export function deprecate<T extends (...args: never[]) => unknown>(
  fn: T,
  message: string,
  code?: string,
  options?: { modifyPrototype?: boolean },
): T {
  if (typeof fn !== "function") {
    throw invalidArgType("fn", "Function", fn);
  }
  let emitted = false;
  function wrapper(this: unknown, ...args: never[]) {
    const process = processInfo();
    if (!emitted && !process?.noDeprecation) {
      emitted = true;
      if (code === undefined || !warned.has(code)) {
        if (code !== undefined) {
          warned.add(code);
        }
        if (process?.throwDeprecation) {
          throw Object.assign(new Error(message), { name: "DeprecationWarning", code });
        }
        if (process?.emitWarning) {
          process.emitWarning(message, "DeprecationWarning", code);
        } else {
          console.warn(`${code ? `[${code}] ` : ""}DeprecationWarning: ${message}`);
        }
      }
    }
    return new.target ? Reflect.construct(fn, args, new.target) : Reflect.apply(fn, this, args);
  }
  Object.setPrototypeOf(wrapper, fn);
  if (options?.modifyPrototype !== false && fn.prototype) {
    wrapper.prototype = fn.prototype;
  }
  return wrapper as T;
}

export function getCallSites(
  frameCount?: number | { sourceMap?: boolean },
  _options?: { sourceMap?: boolean },
) {
  const count = typeof frameCount === "object" || frameCount === undefined ? 10 : frameCount;
  if (typeof count !== "number") {
    throw invalidArgType("frameCount", "number", count);
  }
  if (!Number.isInteger(count) || count < 1 || count > 200) {
    throw outOfRange("frameCount", ">= 1 && <= 200", count);
  }
  const Error = globalThis.Error as ErrorConstructor & { prepareStackTrace?: unknown };
  const previous = Error.prepareStackTrace;
  let stack: string;
  try {
    Reflect.set(Error, "prepareStackTrace", undefined);
    stack = String(new Error().stack ?? "");
  } finally {
    Error.prepareStackTrace = previous;
  }
  return parseCallSites(stack)
    .slice(1, count + 1)
    .map((site) =>
      Object.assign(Object.create(null), {
        functionName: site.getFunctionName() ?? "",
        scriptId: "",
        scriptName: site.getFileName() ?? "",
        lineNumber: site.getLineNumber() ?? 0,
        columnNumber: site.getColumnNumber() ?? 0,
        column: site.getColumnNumber() ?? 0,
      }),
    );
}

export function getSystemErrorName(_error: number): never {
  throw unsupportedNodeApi("util.getSystemErrorName", "host libuv errno tables are not available");
}

export function getSystemErrorMessage(_error: number): never {
  throw unsupportedNodeApi(
    "util.getSystemErrorMessage",
    "host libuv errno tables are not available",
  );
}

export function getSystemErrorMap(): never {
  throw unsupportedNodeApi("util.getSystemErrorMap", "host libuv errno tables are not available");
}

export function setTraceSigInt(_enable: boolean): never {
  throw unsupportedNodeApi(
    "util.setTraceSigInt",
    "components cannot install host process signal handlers",
  );
}

export function convertProcessSignalToExitCode(_signal: number | string): never {
  throw unsupportedNodeApi(
    "util.convertProcessSignalToExitCode",
    "host process signals are not available",
  );
}

export function transferableAbortController(): never {
  throw unsupportedNodeApi(
    "util.transferableAbortController",
    "Node worker transfer hooks are not available",
  );
}

export function transferableAbortSignal(_signal: AbortSignal): never {
  throw unsupportedNodeApi(
    "util.transferableAbortSignal",
    "Node worker transfer hooks are not available",
  );
}

export function _extend(target: unknown, source: unknown): unknown {
  return typeof source === "object" && source !== null
    ? Object.assign(target as object, source)
    : target;
}

export function isArray(_value: unknown): never {
  throw deprecatedNodeApi("util.isArray", "Array.isArray");
}

export function _errnoException(..._args: unknown[]): never {
  throw deprecatedNodeApi("util._errnoException", "a public error API");
}

export function _exceptionWithHostPort(..._args: unknown[]): never {
  throw deprecatedNodeApi("util._exceptionWithHostPort", "a public error API");
}
