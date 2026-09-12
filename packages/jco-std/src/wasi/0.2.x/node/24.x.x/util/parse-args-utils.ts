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
// Adapted from nodejs/node v24.20.0, commit
// 71b8b174857e25106d39b61a9e6f30d927da8b01, lib/internal/util/parse_args/{parse_args,utils}.js.
// Local changes: explicit TypeScript contracts, shared Jco errors, ECMAScript intrinsics.
import { validateObject } from "../internal/validation.js";
import type { ParseArgsOption, OptionValue } from "./parse-args-types.js";

type Options = Record<string, ParseArgsOption>;

type Values = Record<string, OptionValue | undefined>;

// These are internal utilities to make the parsing logic easier to read, and
// add lots of detail for the curious. They are in a separate file to allow
// unit testing, although that is not essential (this could be rolled into
// main file and just tested implicitly via API).
//
// These routines are for internal use, not for export to client.
/**
 * Return the named property, but only if it is an own property.
 * @returns The own property value, or undefined.
 */
export function objectGetOwn<T extends object, K extends keyof T>(
  obj: T,
  prop: K,
): T[K] | undefined {
  if (Object.hasOwn(obj, prop)) {
    return obj[prop];
  }
}

/**
 * Return the named options property, but only if it is an own property.
 * @returns The own property value, or undefined.
 */
export function optionsGetOwn<K extends keyof ParseArgsOption>(
  options: Options,
  longOption: string,
  prop: K,
): ParseArgsOption[K] | undefined {
  if (Object.hasOwn(options, longOption)) {
    return objectGetOwn(options[longOption], prop);
  }
}

/**
 * Determines if the argument may be used as an option value.
 * @example
 * ```
 * isOptionValue('V') // returns true
 * isOptionValue('-v') // returns true (greedy)
 * isOptionValue('--foo') // returns true (greedy)
 * isOptionValue(undefined) // returns false
 * ```
 * @returns {boolean}
 */
export function isOptionValue(value: string | undefined): boolean {
  if (value == null) {
    return false;
  }
  // Open Group Utility Conventions are that an option-argument
  // is the argument after the option, and may start with a dash.
  return true; // greedy!
}

/**
 * Detect whether there is possible confusion and user may have omitted
 * the option argument, like `--port --verbose` when `port` of type:string.
 * In strict mode we throw errors if value is option-like.
 * @returns {boolean}
 */
export function isOptionLikeValue(value: string | undefined): boolean {
  if (value == null) {
    return false;
  }
  return value.length > 1 && value.charAt(0) === "-";
}

/**
 * Determines if `arg` is just a short option.
 * @example '-f'
 * @returns {boolean}
 */
export function isLoneShortOption(arg: string): boolean {
  return arg.length === 2 && arg.charAt(0) === "-" && arg.charAt(1) !== "-";
}

/**
 * Determines if `arg` is a lone long option.
 * @example
 * ```
 * isLoneLongOption('a') // returns false
 * isLoneLongOption('-a') // returns false
 * isLoneLongOption('--foo') // returns true
 * isLoneLongOption('--foo=bar') // returns false
 * ```
 * @returns {boolean}
 */
export function isLoneLongOption(arg: string): boolean {
  return arg.length > 2 && arg.startsWith("--") && !arg.includes("=", 3);
}

/**
 * Determines if `arg` is a long option and value in the same argument.
 * @example
 * ```
 * isLongOptionAndValue('--foo') // returns false
 * isLongOptionAndValue('--foo=bar') // returns true
 * ```
 * @returns {boolean}
 */
export function isLongOptionAndValue(arg: string): boolean {
  return arg.length > 2 && arg.startsWith("--") && arg.includes("=", 3);
}

/**
 * Determines if `arg` is a short option group.
 *
 * See Guideline 5 of the [Open Group Utility Conventions](https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap12.html).
 *   One or more options without option-arguments, followed by at most one
 *   option that takes an option-argument, should be accepted when grouped
 *   behind one '-' delimiter.
 * @example
 * ```
 * isShortOptionGroup('-a', {}) // returns false
 * isShortOptionGroup('-ab', {}) // returns true
 * // -fb is an option and a value, not a short option group
 * isShortOptionGroup('-fb', {
 *   options: { f: { type: 'string' } }
 * }) // returns false
 * isShortOptionGroup('-bf', {
 *   options: { f: { type: 'string' } }
 * }) // returns true
 * // -bfb is an edge case, return true and caller sorts it out
 * isShortOptionGroup('-bfb', {
 *   options: { f: { type: 'string' } }
 * }) // returns true
 * ```
 * @returns {boolean}
 */
export function isShortOptionGroup(arg: string, options: Options): boolean {
  if (arg.length <= 2) {
    return false;
  }
  if (arg.charAt(0) !== "-") {
    return false;
  }
  if (arg.charAt(1) === "-") {
    return false;
  }
  const firstShort = arg.charAt(1);
  const longOption = findLongOptionForShort(firstShort, options);
  return optionsGetOwn(options, longOption, "type") !== "string";
}

/**
 * Determine if arg is a short string option followed by its value.
 * @example
 * ```
 * isShortOptionAndValue('-a', {}); // returns false
 * isShortOptionAndValue('-ab', {}); // returns false
 * isShortOptionAndValue('-fFILE', {
 *   options: { foo: { short: 'f', type: 'string' }}
 * }) // returns true
 * ```
 * @returns {boolean}
 */
export function isShortOptionAndValue(arg: string, options: Options): boolean {
  validateObject(options, "options");
  if (arg.length <= 2) {
    return false;
  }
  if (arg.charAt(0) !== "-") {
    return false;
  }
  if (arg.charAt(1) === "-") {
    return false;
  }
  const shortOption = arg.charAt(1);
  const longOption = findLongOptionForShort(shortOption, options);
  return optionsGetOwn(options, longOption, "type") === "string";
}

/**
 * Find the long option associated with a short option. Looks for a configured
 * `short` and returns the short option itself if a long option is not found.
 * @example
 * ```
 * findLongOptionForShort('a', {}) // returns 'a'
 * findLongOptionForShort('b', {
 *   options: { bar: { short: 'b' } }
 * }) // returns 'bar'
 * ```
 * @returns {boolean}
 */
export function findLongOptionForShort(shortOption: string, options: Options): string {
  validateObject(options, "options");
  const longOptionEntry = Object.entries(options).find(
    ({ 1: optionConfig }) => objectGetOwn(optionConfig, "short") === shortOption,
  );
  return longOptionEntry?.[0] ?? shortOption;
}

/**
 * Check if the given option includes a default value
 * and that option has not been set by the input args.
 * @param {string} longOption - long option name e.g. 'foo'
 * @param {object} optionConfig - the option configuration properties
 * @param {object} values - option values returned in `values` by parseArgs
 * @returns {boolean}
 */
export function useDefaultValueOption(
  longOption: string,
  optionConfig: ParseArgsOption,
  values: Values,
): boolean {
  return objectGetOwn(optionConfig, "default") !== undefined && values[longOption] === undefined;
}
