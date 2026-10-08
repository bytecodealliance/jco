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
import { TextDecoder, TextEncoder } from "../text-encoding.js";
export { TextDecoder, TextEncoder };

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
