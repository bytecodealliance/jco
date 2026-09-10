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
import {
  codedError,
  invalidArgType,
  invalidArgValue,
  validateObject,
  unsupportedNodeApi,
} from "../errors/core.js";
import {
  findLongOptionForShort,
  isLoneLongOption,
  isLoneShortOption,
  isLongOptionAndValue,
  isOptionValue,
  isOptionLikeValue,
  isShortOptionAndValue,
  isShortOptionGroup,
  useDefaultValueOption,
  objectGetOwn,
  optionsGetOwn,
} from "./parse-args-utils.js";
import type {
  ParseArgsOption,
  ParseArgsConfig,
  OptionToken,
  ParseArgsToken,
  OptionValue,
  ParsedResults,
} from "./parse-args-types.js";
export type * from "./parse-args-types.js";

type Options = Record<string, ParseArgsOption>;

type Values = Record<string, OptionValue | undefined>;

interface Result {
  values: Values;
  positionals: string[];
  tokens?: ParseArgsToken[];
}

function validateString(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string") {
    throw invalidArgType(name, "string", value);
  }
}

function validateBoolean(value: unknown, name: string): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw invalidArgType(name, "boolean", value);
  }
}

function validateArray(value: unknown, name: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw invalidArgType(name, "Array", value);
  }
}

function validateStringArray(value: unknown, name: string): asserts value is string[] {
  validateArray(value, name);
  value.forEach((v, i) => validateString(v, `${name}[${i}]`));
}

function validateBooleanArray(value: unknown, name: string): asserts value is boolean[] {
  validateArray(value, name);
  value.forEach((v, i) => validateBoolean(v, `${name}[${i}]`));
}

function validateUnion(value: unknown, name: string, allowed: string[]): void {
  if (!allowed.includes(value as string)) {
    throw invalidArgType(name, `('${allowed.join("| ")}')`, value);
  }
}

function invalidOption(message: string): TypeError {
  return codedError(new TypeError(message), "ERR_PARSE_ARGS_INVALID_OPTION_VALUE");
}

function unknownOption(option: string, allowPositionals: boolean): TypeError {
  const suffix = allowPositionals
    ? `. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- ${JSON.stringify(option)}`
    : "";
  return codedError(
    new TypeError(`Unknown option '${option}'${suffix}`),
    "ERR_PARSE_ARGS_UNKNOWN_OPTION",
  );
}

/**
 * In strict mode, throw for possible usage errors like --foo --bar
 * @param {object} token - from tokens as available from parseArgs
 */
function checkOptionLikeValue(token: OptionToken): void {
  if (!token.inlineValue && isOptionLikeValue(token.value)) {
    // Only show short example if user used short option.
    const example = token.rawName.startsWith("--")
      ? `'${token.rawName}=-XYZ'`
      : `'--${token.name}=-XYZ' or '${token.rawName}-XYZ'`;
    const errorMessage = `Option '${token.rawName}' argument is ambiguous.
Did you forget to specify the option argument for '${token.rawName}'?
To specify an option argument starting with a dash use ${example}.`;
    throw invalidOption(errorMessage);
  }
}

/**
 * In strict mode, throw for usage errors.
 * @param {object} config - from config passed to parseArgs
 * @param {object} token - from tokens as available from parseArgs
 */
function checkOptionUsage(
  config: {
    options: Options;
    allowNegative: boolean;
    allowPositionals: boolean;
  },
  token: OptionToken,
): void {
  let tokenName = token.name;
  if (!Object.hasOwn(config.options, tokenName)) {
    // Check for negated boolean option.
    if (config.allowNegative && tokenName.startsWith("no-")) {
      tokenName = tokenName.slice(3);
      if (
        !Object.hasOwn(config.options, tokenName) ||
        optionsGetOwn(config.options, tokenName, "type") !== "boolean"
      ) {
        throw unknownOption(token.rawName, config.allowPositionals);
      }
    } else {
      throw unknownOption(token.rawName, config.allowPositionals);
    }
  }
  const short = optionsGetOwn(config.options, tokenName, "short");
  const shortAndLong = `${short ? `-${short}, ` : ""}--${tokenName}`;
  const type = optionsGetOwn(config.options, tokenName, "type");
  if (type === "string" && typeof token.value !== "string") {
    throw invalidOption(`Option '${shortAndLong} <value>' argument missing`);
  }
  // (Idiomatic test for undefined||null, expecting undefined.)
  if (type === "boolean" && token.value != null) {
    throw invalidOption(`Option '${shortAndLong}' does not take an argument`);
  }
}

/**
 * Store the option value in `values`.
 * @param {object} token - from tokens as available from parseArgs
 * @param {object} options - option configs, from parseArgs({ options })
 * @param {object} values - option values returned in `values` by parseArgs
 * @param {boolean} allowNegative - allow negative optinons if true
 */
function storeOption(
  token: OptionToken,
  options: Options,
  values: Values,
  allowNegative: boolean,
): void {
  let longOption = token.name;
  let optionValue: string | boolean | undefined = token.value;
  if (longOption === "__proto__") {
    return; // No. Just no.
  }
  if (allowNegative && longOption.startsWith("no-") && optionValue === undefined) {
    // Boolean option negation: --no-foo
    longOption = longOption.slice(3);
    token.name = longOption;
    optionValue = false;
  }
  // We store based on the option value rather than option type,
  // preserving the users intent for author to deal with.
  const newValue = optionValue ?? true;
  if (optionsGetOwn(options, longOption, "multiple")) {
    // Always store value in array, including for boolean.
    // values[longOption] starts out not present,
    // first value is added as new array [newValue],
    // subsequent values are pushed to existing array.
    // (note: values has null prototype, so simpler usage)
    if (values[longOption]) {
      (values[longOption] as (string | boolean)[]).push(newValue);
    } else {
      values[longOption] = [newValue];
    }
  } else {
    values[longOption] = newValue;
  }
}

/**
 * Store the default option value in `values`.
 * @param {string} longOption - long option name e.g. 'foo'
 * @param {string
 *         | boolean
 *         | string[]
 *         | boolean[]} optionValue - default value from option config
 * @param {object} values - option values returned in `values` by parseArgs
 */
function storeDefaultOption(longOption: string, optionValue: OptionValue, values: Values): void {
  if (longOption === "__proto__") {
    return; // No. Just no.
  }
  values[longOption] = optionValue;
}

/**
 * Process args and turn into identified tokens:
 * - option (along with value, if any)
 * - positional
 * - option-terminator
 * @param {string[]} args - from parseArgs({ args }) or mainArgs
 * @param {object} options - option configs, from parseArgs({ options })
 * @returns Parsed argument tokens.
 */
function argsToTokens(args: string[], options: Options): ParseArgsToken[] {
  const tokens: ParseArgsToken[] = [];
  let index = -1;
  let groupCount = 0;
  const remainingArgs = args.slice();
  while (remainingArgs.length > 0) {
    const arg = remainingArgs.shift()!;
    const nextArg = remainingArgs[0];
    if (groupCount > 0) {
      groupCount--;
    } else {
      index++;
    }
    // Check if `arg` is an options terminator.
    // Guideline 10 in https://pubs.opengroup.org/onlinepubs/9699919799/basedefs/V1_chap12.html
    if (arg === "--") {
      // Everything after a bare '--' is considered a positional argument.
      tokens.push({ kind: "option-terminator", index });
      tokens.push(
        ...remainingArgs.map((arg): ParseArgsToken => {
          return { kind: "positional", index: ++index, value: arg };
        }),
      );
      break; // Finished processing args, leave while loop.
    }
    if (isLoneShortOption(arg)) {
      // e.g. '-f'
      const shortOption = arg.charAt(1);
      const longOption = findLongOptionForShort(shortOption, options);
      let value;
      let inlineValue;
      if (optionsGetOwn(options, longOption, "type") === "string" && isOptionValue(nextArg)) {
        // e.g. '-f', 'bar'
        value = remainingArgs.shift();
        inlineValue = false;
      }
      tokens.push({ kind: "option", name: longOption, rawName: arg, index, value, inlineValue });
      if (value != null) {
        ++index;
      }
      continue;
    }
    if (isShortOptionGroup(arg, options)) {
      // Expand -fXzy to -f -X -z -y
      const expanded: string[] = [];
      for (let index = 1; index < arg.length; index++) {
        const shortOption = arg.charAt(index);
        const longOption = findLongOptionForShort(shortOption, options);
        if (optionsGetOwn(options, longOption, "type") !== "string" || index === arg.length - 1) {
          // Boolean option, or last short in group. Well formed.
          expanded.push(`-${shortOption}`);
        } else {
          // String option in middle. Yuck.
          // Expand -abfFILE to -a -b -fFILE
          expanded.push(`-${arg.slice(index)}`);
          break; // finished short group
        }
      }
      remainingArgs.unshift(...expanded);
      groupCount = expanded.length;
      continue;
    }
    if (isShortOptionAndValue(arg, options)) {
      // e.g. -fFILE
      const shortOption = arg.charAt(1);
      const longOption = findLongOptionForShort(shortOption, options);
      const value = arg.slice(2);
      tokens.push({
        kind: "option",
        name: longOption,
        rawName: `-${shortOption}`,
        index,
        value,
        inlineValue: true,
      });
      continue;
    }
    if (isLoneLongOption(arg)) {
      // e.g. '--foo'
      const longOption = arg.slice(2);
      let value;
      let inlineValue;
      if (optionsGetOwn(options, longOption, "type") === "string" && isOptionValue(nextArg)) {
        // e.g. '--foo', 'bar'
        value = remainingArgs.shift();
        inlineValue = false;
      }
      tokens.push({ kind: "option", name: longOption, rawName: arg, index, value, inlineValue });
      if (value != null) {
        ++index;
      }
      continue;
    }
    if (isLongOptionAndValue(arg)) {
      // e.g. --foo=bar
      const equalIndex = arg.indexOf("=");
      const longOption = arg.slice(2, equalIndex);
      const value = arg.slice(equalIndex + 1);
      tokens.push({
        kind: "option",
        name: longOption,
        rawName: `--${longOption}`,
        index,
        value,
        inlineValue: true,
      });
      continue;
    }
    tokens.push({ kind: "positional", index, value: arg });
  }
  return tokens;
}

export function parseArgs<T extends ParseArgsConfig>(config: T): ParsedResults<T>;

export function parseArgs(config?: ParseArgsConfig): Result;

export function parseArgs(config: ParseArgsConfig = {}): Result {
  const args = objectGetOwn(config, "args");
  if (args == null) {
    throw unsupportedNodeApi("util.parseArgs without args", "pass guest arguments explicitly");
  }
  const strict = objectGetOwn(config, "strict") ?? true;
  const allowPositionals = objectGetOwn(config, "allowPositionals") ?? !strict;
  const returnTokens = objectGetOwn(config, "tokens") ?? false;
  const allowNegative = objectGetOwn(config, "allowNegative") ?? false;
  const options = objectGetOwn(config, "options") ?? (Object.create(null) as Options);
  // Bundle these up for passing to strict-mode checks.
  const parseConfig = { args, strict, options, allowPositionals, allowNegative };
  // Validate input configuration.
  validateArray(args, "args");
  validateBoolean(strict, "strict");
  validateBoolean(allowPositionals, "allowPositionals");
  validateBoolean(returnTokens, "tokens");
  validateBoolean(allowNegative, "allowNegative");
  validateObject(options, "options");
  Object.entries(options).forEach(({ 0: longOption, 1: optionConfig }) => {
    validateObject(optionConfig, `options.${longOption}`);
    // type is required
    const optionType = objectGetOwn(optionConfig, "type");
    validateUnion(optionType, `options.${longOption}.type`, ["string", "boolean"]);
    if (Object.hasOwn(optionConfig, "short")) {
      const shortOption = optionConfig.short;
      validateString(shortOption, `options.${longOption}.short`);
      if (shortOption.length !== 1) {
        throw invalidArgValue(
          `options.${longOption}.short`,
          shortOption,
          "must be a single character",
        );
      }
    }
    const multipleOption = objectGetOwn(optionConfig, "multiple");
    if (Object.hasOwn(optionConfig, "multiple")) {
      validateBoolean(multipleOption, `options.${longOption}.multiple`);
    }
    const defaultValue = objectGetOwn(optionConfig, "default");
    if (defaultValue !== undefined) {
      let validator: ((value: unknown, name: string) => void) | undefined;
      switch (optionType) {
        case "string":
          validator = multipleOption ? validateStringArray : validateString;
          break;
        case "boolean":
          validator = multipleOption ? validateBooleanArray : validateBoolean;
          break;
      }
      validator!(defaultValue, `options.${longOption}.default`);
    }
  });
  // Phase 1: identify tokens
  const tokens = argsToTokens(args, options);
  // Phase 2: process tokens into parsed option values and positionals
  const result: Result = {
    values: Object.create(null) as Values,
    positionals: [],
  };
  if (returnTokens) {
    result.tokens = tokens;
  }
  tokens.forEach((token) => {
    if (token.kind === "option") {
      if (strict) {
        checkOptionUsage(parseConfig, token);
        checkOptionLikeValue(token);
      }
      storeOption(token, options, result.values, parseConfig.allowNegative);
    } else if (token.kind === "positional") {
      if (!allowPositionals) {
        throw codedError(
          new TypeError(
            `Unexpected argument '${token.value}'. This command does not take positional arguments`,
          ),
          "ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL",
        );
      }
      result.positionals.push(token.value);
    }
  });
  // Phase 3: fill in default values for missing args
  Object.entries(options).forEach(({ 0: longOption, 1: optionConfig }) => {
    const mustSetDefault = useDefaultValueOption(longOption, optionConfig, result.values);
    if (mustSetDefault) {
      storeDefaultOption(longOption, objectGetOwn(optionConfig, "default")!, result.values);
    }
  });
  return result;
}
