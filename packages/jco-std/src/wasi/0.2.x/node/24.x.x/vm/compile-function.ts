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

// Adapted from Node.js v24.20.0, commit 71b8b174857e25106d39b61a9e6f30d927da8b01,
// lib/vm.js and lib/internal/vm/module.js (MIT). Local changes: typed ESM, shared
// validators, guest evaluation, and explicit refusals of native-only features.
// See README.md for the source audit and supported execution contract.

import { parse } from "acorn";
import { invalidArgType } from "../errors/core.js";
import { validateBoolean, validateObject, validateString } from "../internal/validation.js";
import { namedSource, rejectDynamicImports } from "./source.js";
import { rejectCachedData, rejectDynamicLoader, validateSourceOptions } from "./options.js";
import { unsupported, unsupportedContext } from "./unsupported.js";
import type { CompiledFunction, CompileFunctionOptions } from "./types.js";

// Function's standard declaration returns the untyped Function interface. This
// boundary keeps arbitrary evaluated arguments/results explicitly typed as unknown.
const compile = Function as unknown as (...source: string[]) => CompiledFunction;

function readParameters(params: unknown): string[] {
  if (!Array.isArray(params)) {
    throw invalidArgType("params", "Array", params);
  }

  const parameters: string[] = [];

  for (let index = 0; index < params.length; index++) {
    const parameter: unknown = params[index];
    validateString(parameter, `params[${index}]`);

    const program = parse(`(${parameter})`, { ecmaVersion: "latest" });
    const statement = program.body[0];

    // Native compileFunction receives individual parameter names, whereas Function
    // accepts parameter-list source. Do not accidentally admit commas or defaults.
    if (
      statement?.type !== "ExpressionStatement" ||
      statement.expression.type !== "Identifier" ||
      statement.expression.name !== parameter
    ) {
      throw new SyntaxError("vm.compileFunction parameters must be identifier names");
    }

    parameters.push(parameter);
  }

  return parameters;
}

function validateContextOptions(options: CompileFunctionOptions): void {
  const { parsingContext, contextExtensions = [] } = options;

  if (parsingContext !== undefined) {
    unsupportedContext("vm.compileFunction options.parsingContext");
  }

  if (!Array.isArray(contextExtensions)) {
    throw invalidArgType("options.contextExtensions", "Array", contextExtensions);
  }

  if (contextExtensions.length !== 0) {
    unsupportedContext("vm.compileFunction options.contextExtensions");
  }
}

export function compileFunction(
  code: string,
  params?: string[],
  options: CompileFunctionOptions = {},
): CompiledFunction {
  validateString(code, "code");
  validateObject(options, "options");

  // Snapshot each validated name once; never re-read accessors while compiling.
  const parameters = params === undefined ? [] : readParameters(params);

  const filename = validateSourceOptions(options, "");

  rejectCachedData(options.cachedData);

  const { produceCachedData = false } = options;
  validateBoolean(produceCachedData, "options.produceCachedData");

  if (produceCachedData) {
    unsupported(
      "vm.compileFunction options.produceCachedData",
      "the guest engine does not expose V8 bytecode caches",
    );
  }

  validateContextOptions(options);
  rejectDynamicLoader(options.importModuleDynamically);

  const program = parse(`(function(${parameters.join(",")}) {\n${code}\n})`, {
    ecmaVersion: "latest",
    sourceType: "script",
  });
  rejectDynamicImports(program);

  const result = compile(...parameters, namedSource(code, filename));

  // Node's compiled functions are unnamed; the Function constructor uses "anonymous".
  Object.defineProperty(result, "name", { value: "", configurable: true });

  return result;
}
