import { MIMEParams, MIMEType } from "./mime.js";
import { callbackify, inherits, promisify } from "./callbacks.js";
import { diff } from "./diff.js";
import { parseArgs } from "./parse-args.js";
import { parseEnv } from "./parse-env.js";
import { inspect, format, formatWithOptions } from "./inspect.js";
import { stripVTControlCharacters, styleText, toUSVString } from "./text.js";
import { aborted } from "./aborted.js";
import { isDeepStrictEqual } from "../assert/comparisons.js";
import types from "../util-types.js";
import { unsupportedNodeApi } from "../errors/core.js";
import * as unsupported from "./unsupported.js";

export {
  MIMEParams,
  MIMEType,
  callbackify,
  inherits,
  promisify,
  diff,
  parseArgs,
  parseEnv,
  inspect,
  format,
  formatWithOptions,
  stripVTControlCharacters,
  styleText,
  toUSVString,
  aborted,
  isDeepStrictEqual,
  types,
};
export * from "./unsupported.js";
export type { InspectOptions, InspectFunction } from "./inspect.js";
export type { StyleTextOptions } from "./text.js";
export type * from "./parse-args-types.js";
export type { Difference } from "./diff.js";

// These fallbacks are constructor-only refusal points, with the public constructor
// types retained for callers. They never create an incomplete decoder or encoder.
export const TextDecoder: typeof globalThis.TextDecoder =
  globalThis.TextDecoder ??
  (function TextDecoder(): never {
    throw unsupportedNodeApi("util.TextDecoder", "the engine does not provide TextDecoder");
  } as unknown as typeof globalThis.TextDecoder);

export const TextEncoder: typeof globalThis.TextEncoder =
  globalThis.TextEncoder ??
  (function TextEncoder(): never {
    throw unsupportedNodeApi("util.TextEncoder", "the engine does not provide TextEncoder");
  } as unknown as typeof globalThis.TextEncoder);

export default {
  ...unsupported,
  MIMEParams,
  MIMEType,
  TextDecoder,
  TextEncoder,
  aborted,
  callbackify,
  diff,
  format,
  formatWithOptions,
  inherits,
  inspect,
  isDeepStrictEqual,
  parseArgs,
  parseEnv,
  promisify,
  stripVTControlCharacters,
  styleText,
  toUSVString,
  types,
};
