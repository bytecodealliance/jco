/**
 * Errors for `node:module`.
 *
 * Two kinds. Node's own coded errors are reproduced where Jco can answer as Node would -- a
 * `require.resolve` that finds nothing really is `MODULE_NOT_FOUND`. Everything that needs a module
 * loader carries `ERR_JCO_UNSUPPORTED_NODE_API` and says why, so a refusal is never mistaken for a
 * lookup that simply failed.
 *
 * The coded-error factory and the `Received ...` clause are the shared ones in `../errors/core.js`.
 */

import {
  type CodedError as SharedCodedError,
  codedError,
  determineSpecificType,
  unsupportedNodeApi,
} from "../errors/core.js";

export { UNSUPPORTED_CODE } from "../errors/core.js";

/** Why the loading half of this module cannot exist here. Shared so every message agrees. */
const NO_LOADER =
  "a component has no module loader: `jco componentize` bundles the whole graph ahead of time, " +
  "and the engine cannot compile or link a module that was not present at build time";

type CodedError = SharedCodedError<Error, string>;

/**
 * Refuse an entry point whose job is to load something.
 *
 * @param api - the entry point being used, as a user would write it
 * @param instead - what to do instead, when there is something
 */
export function unsupported(api: string, instead?: string): CodedError {
  return unsupportedNodeApi(api, `${NO_LOADER}${instead ? `. ${instead}` : ""}`);
}

/** Node's `MODULE_NOT_FOUND`, for a specifier that genuinely resolves to nothing. */
export function moduleNotFound(specifier: string): CodedError {
  return codedError(new Error(`Cannot find module '${specifier}'`), "MODULE_NOT_FOUND");
}

/**
 * Node's `ERR_INVALID_ARG_TYPE`.
 *
 * `expected` is a complete phrase ("an object", "a valid base64 VLQ string") rather than a type
 * name, which is why this does not delegate to the shared `invalidArgType` and its
 * "must be of type" template.
 */
export function invalidArgType(name: string, expected: string, actual: unknown): CodedError {
  return codedError(
    new TypeError(
      `The "${name}" argument must be ${expected}. Received ${determineSpecificType(actual)}`,
    ),
    "ERR_INVALID_ARG_TYPE",
  );
}
