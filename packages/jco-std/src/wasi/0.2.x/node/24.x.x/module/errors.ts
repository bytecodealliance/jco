/**
 * Errors for `node:module`.
 *
 * Two kinds. Node's own coded errors are reproduced where Jco can answer as Node would -- a
 * `require.resolve` that finds nothing really is `MODULE_NOT_FOUND`. Everything that needs a module
 * loader carries `ERR_JCO_UNSUPPORTED_NODE_API` and says why, so a refusal is never mistaken for a
 * lookup that simply failed.
 */

/** Error code carried by every unsupported-API failure Jco raises for Node builtins. */
export const UNSUPPORTED_CODE = "ERR_JCO_UNSUPPORTED_NODE_API";

/** Why the loading half of this module cannot exist here. Shared so every message agrees. */
const NO_LOADER =
  "a component has no module loader: `jco componentize` bundles the whole graph ahead of time, " +
  "and the engine cannot compile or link a module that was not present at build time";

interface CodedError extends Error {
  code: string;
}

function coded(code: string, message: string): CodedError {
  const error = new Error(message) as CodedError;
  error.code = code;
  return error;
}

/**
 * Refuse an entry point whose job is to load something.
 *
 * @param api - the entry point being used, as a user would write it
 * @param instead - what to do instead, when there is something
 */
export function unsupported(api: string, instead?: string): CodedError {
  return coded(
    UNSUPPORTED_CODE,
    `${api} is not supported in a WebAssembly component: ${NO_LOADER}${instead ? `. ${instead}` : ""}`,
  );
}

/** Node's `MODULE_NOT_FOUND`, for a specifier that genuinely resolves to nothing. */
export function moduleNotFound(specifier: string): CodedError {
  return coded("MODULE_NOT_FOUND", `Cannot find module '${specifier}'`);
}

/** Node's `ERR_INVALID_ARG_TYPE`. */
export function invalidArgType(name: string, expected: string, actual: unknown): CodedError {
  const received =
    actual === null || actual === undefined
      ? String(actual)
      : typeof actual === "string"
        ? `type string ('${actual}')`
        : typeof actual === "object"
          ? `an instance of ${(actual as object).constructor?.name ?? "Object"}`
          : `type ${typeof actual} (${String(actual)})`;
  return coded(
    "ERR_INVALID_ARG_TYPE",
    `The "${name}" argument must be ${expected}. Received ${received}`,
  );
}
