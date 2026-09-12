// node:assert shares the versioned Node Errors foundation so its public error
// codes, formatting, and descriptors stay consistent with the other shims.
export {
  ambiguousArgument,
  codedError,
  constructCallRequired,
  deprecatedNodeApi,
  invalidArgType,
  invalidArgValue,
  invalidReturnValue,
  missingArgs,
  outOfRange,
} from "../errors/core.js";
export {
  validateFunction,
  validateObject,
  validateOneOf,
  validateUint32,
} from "../internal/validation.js";

export type { ErrorCode } from "../errors/core.js";
