import { deprecatedNodeApi, unsupportedNodeApi } from "../errors/core.js";

export function debuglog(
  _section: string,
  _callback?: (fn: (...args: unknown[]) => void) => void,
): never {
  throw unsupportedNodeApi(
    "util.debuglog",
    "Node debug environment and process logging are not available",
  );
}

export const debug: typeof debuglog = debuglog;

export function deprecate<T extends (...args: never[]) => unknown>(
  _fn: T,
  _message: string,
  _code?: string,
  _options?: { modifyPrototype?: boolean },
): never {
  throw unsupportedNodeApi("util.deprecate", "Node process warning policy is not available");
}

export function getCallSites(
  _frameCount?: number | { sourceMap?: boolean },
  _options?: { sourceMap?: boolean },
): never {
  throw unsupportedNodeApi(
    "util.getCallSites",
    "native call sites and source maps are not exposed by component engines",
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

export function _extend(_target: unknown, _source: unknown): never {
  throw deprecatedNodeApi("util._extend", "Object.assign");
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
