/**
 * Node.js Errors globals and shared compatibility helpers.
 *
 * The public behavior follows nodejs/node v24.19.0, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, doc/api/errors.md and
 * lib/internal/errors.js (MIT license). The standard constructors retain the
 * guest engine's identities; portable fallbacks are installed only for newer
 * globals or V8 Error extensions absent from that engine.
 */

export * from "./errors/core.js";

import {
  AbortError,
  codedError,
  determineSpecificType,
  formatList,
  genericNodeError,
  invalidArgType,
  invalidArgValue,
  missingArgs,
  outOfRange,
  systemError,
  unsupportedNodeApi,
} from "./errors/core.js";

import { parseCallSites } from "./errors/call-site.js";

export { parseCallSites, type CallSite } from "./errors/call-site.js";

type ConstructorFunction = (...args: never[]) => unknown;

export interface NodeErrorConstructor extends ErrorConstructor {
  captureStackTrace(targetObject: object, constructorOpt?: ConstructorFunction): void;
  isError(value: unknown): value is Error;
  stackTraceLimit: number;
}

function captureStackTrace(targetObject: object, constructorOpt?: ConstructorFunction): void {
  if (
    (typeof targetObject !== "object" && typeof targetObject !== "function") ||
    targetObject === null
  ) {
    throw invalidArgType("targetObject", "Object", targetObject);
  }
  const target = targetObject as { message?: unknown; name?: unknown };
  const captured = new globalThis.Error();
  const raw = captured.stack ?? "Error";
  let stack = raw;
  if (constructorOpt?.name) {
    const lines = stack.split("\n");
    const frame = lines.findIndex((line) => line.includes(constructorOpt.name));
    if (frame >= 0) {
      stack = [lines[0], ...lines.slice(frame + 1)].join("\n");
    }
  }
  const name = typeof target.name === "string" ? target.name : "Error";
  const message = typeof target.message === "string" ? target.message : "";
  const lines = stack.split("\n");
  lines[0] = message ? `${name}: ${message}` : name;
  const rendered = lines.join("\n");

  // Node computes `stack` when it is first read, and asks `Error.prepareStackTrace` to render
  // it. Packages set that hook to collect the frames as objects rather than as text -- `depd`
  // does it while being imported, so this runs before a component handles anything -- and
  // they restore the previous hook straight afterwards. Reading lazily is what makes the hook
  // that was installed at read time the one that gets used.
  let value: unknown;
  let computed = false;
  Object.defineProperty(targetObject, "stack", {
    enumerable: false,
    configurable: true,
    get() {
      if (!computed) {
        computed = true;
        const prepare = (globalThis.Error as NodeErrorConstructor).prepareStackTrace;
        value =
          typeof prepare === "function"
            ? prepare(
                targetObject as Error,
                parseCallSites(raw, constructorOpt?.name) as unknown as NodeJS.CallSite[],
              )
            : rendered;
      }
      return value;
    },
    set(replacement: unknown) {
      computed = true;
      value = replacement;
    },
  });
}

function ensureNodeErrorConstructor(): NodeErrorConstructor {
  const constructor = globalThis.Error as NodeErrorConstructor;
  let compatibleCaptureStackTrace = false;
  if (typeof constructor.captureStackTrace === "function") {
    try {
      const target = { name: "JcoErrorProbe", message: "probe" } as { stack?: unknown };
      constructor.captureStackTrace(target);
      compatibleCaptureStackTrace =
        typeof target.stack === "string" && target.stack.startsWith("JcoErrorProbe: probe");
    } catch {
      // Replace partial or incompatible engine implementations below.
    }
  }
  if (!compatibleCaptureStackTrace) {
    Object.defineProperty(constructor, "captureStackTrace", {
      value: captureStackTrace,
      enumerable: false,
      configurable: true,
      writable: true,
    });
  }
  if (!("stackTraceLimit" in constructor)) {
    Object.defineProperty(constructor, "stackTraceLimit", {
      value: 10,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  if (typeof constructor.isError !== "function") {
    Object.defineProperty(constructor, "isError", {
      value(value: unknown): value is Error {
        return Object.prototype.toString.call(value) === "[object Error]";
      },
      enumerable: false,
      configurable: true,
      writable: true,
    });
  }
  return constructor;
}

export const Error: NodeErrorConstructor = ensureNodeErrorConstructor();
export const EvalError: EvalErrorConstructor = globalThis.EvalError;
export const RangeError: RangeErrorConstructor = globalThis.RangeError;
export const ReferenceError: ReferenceErrorConstructor = globalThis.ReferenceError;
export const SyntaxError: SyntaxErrorConstructor = globalThis.SyntaxError;
export const TypeError: TypeErrorConstructor = globalThis.TypeError;
export const URIError: URIErrorConstructor = globalThis.URIError;

class PortableAggregateError extends globalThis.Error {
  errors!: unknown[];

  constructor(errors: Iterable<unknown>, message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AggregateError";
    Object.defineProperty(this, "errors", {
      value: [...errors],
      enumerable: false,
      configurable: true,
      writable: true,
    });
  }
}

class PortableSuppressedError extends globalThis.Error {
  error!: unknown;
  suppressed!: unknown;

  constructor(error: unknown, suppressed: unknown, message?: string) {
    super(message);
    this.name = "SuppressedError";
    Object.defineProperties(this, {
      error: { value: error, enumerable: false, configurable: true, writable: true },
      suppressed: { value: suppressed, enumerable: false, configurable: true, writable: true },
    });
  }
}

const DOM_EXCEPTION_CODES: Readonly<Record<string, number>> = {
  IndexSizeError: 1,
  DOMStringSizeError: 2,
  HierarchyRequestError: 3,
  WrongDocumentError: 4,
  InvalidCharacterError: 5,
  NoDataAllowedError: 6,
  NoModificationAllowedError: 7,
  NotFoundError: 8,
  NotSupportedError: 9,
  InUseAttributeError: 10,
  InvalidStateError: 11,
  SyntaxError: 12,
  InvalidModificationError: 13,
  NamespaceError: 14,
  InvalidAccessError: 15,
  ValidationError: 16,
  TypeMismatchError: 17,
  SecurityError: 18,
  NetworkError: 19,
  AbortError: 20,
  URLMismatchError: 21,
  QuotaExceededError: 22,
  TimeoutError: 23,
  InvalidNodeTypeError: 24,
  DataCloneError: 25,
};

class PortableDOMException extends globalThis.Error {
  readonly code: number;

  constructor(message = "", name = "Error") {
    super(message);
    this.name = name;
    this.code = DOM_EXCEPTION_CODES[name] ?? 0;
  }
}

const DOM_EXCEPTION_CONSTANTS: Readonly<Record<string, number>> = {
  INDEX_SIZE_ERR: 1,
  DOMSTRING_SIZE_ERR: 2,
  HIERARCHY_REQUEST_ERR: 3,
  WRONG_DOCUMENT_ERR: 4,
  INVALID_CHARACTER_ERR: 5,
  NO_DATA_ALLOWED_ERR: 6,
  NO_MODIFICATION_ALLOWED_ERR: 7,
  NOT_FOUND_ERR: 8,
  NOT_SUPPORTED_ERR: 9,
  INUSE_ATTRIBUTE_ERR: 10,
  INVALID_STATE_ERR: 11,
  SYNTAX_ERR: 12,
  INVALID_MODIFICATION_ERR: 13,
  NAMESPACE_ERR: 14,
  INVALID_ACCESS_ERR: 15,
  VALIDATION_ERR: 16,
  TYPE_MISMATCH_ERR: 17,
  SECURITY_ERR: 18,
  NETWORK_ERR: 19,
  ABORT_ERR: 20,
  URL_MISMATCH_ERR: 21,
  QUOTA_EXCEEDED_ERR: 22,
  TIMEOUT_ERR: 23,
  INVALID_NODE_TYPE_ERR: 24,
  DATA_CLONE_ERR: 25,
};

for (const [name, value] of Object.entries(DOM_EXCEPTION_CONSTANTS)) {
  const descriptor = { value, enumerable: true, configurable: false, writable: false };
  Object.defineProperty(PortableDOMException, name, descriptor);
  Object.defineProperty(PortableDOMException.prototype, name, descriptor);
}

interface OptionalErrorGlobals {
  AggregateError?: AggregateErrorConstructor;
  DOMException?: typeof globalThis.DOMException;
  SuppressedError?: SuppressedErrorConstructor;
}

const optionalGlobals = globalThis as typeof globalThis & OptionalErrorGlobals;

// These casts express the standard constructor contracts implemented by the
// portable fallbacks. Their instance fields use `unknown` internally instead
// of the standard library's legacy `any` declarations.
export const AggregateError: AggregateErrorConstructor =
  optionalGlobals.AggregateError ??
  (PortableAggregateError as unknown as AggregateErrorConstructor);
export const DOMException: typeof globalThis.DOMException =
  optionalGlobals.DOMException ??
  (PortableDOMException as unknown as typeof globalThis.DOMException);
export const SuppressedError: SuppressedErrorConstructor =
  optionalGlobals.SuppressedError ??
  (PortableSuppressedError as unknown as SuppressedErrorConstructor);

export default {
  AbortError,
  AggregateError,
  DOMException,
  Error,
  EvalError,
  RangeError,
  ReferenceError,
  SuppressedError,
  SyntaxError,
  TypeError,
  URIError,
  codedError,
  determineSpecificType,
  formatList,
  genericNodeError,
  invalidArgType,
  invalidArgValue,
  missingArgs,
  outOfRange,
  systemError,
  unsupportedNodeApi,
};
