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

import { parseScript, rejectGlobalDeclarations, namedSource } from "./source.js";
import type { ParsedScript } from "./source.js";
import {
  rejectCachedData,
  rejectDeprecatedCacheOption,
  rejectDynamicLoader,
  scriptOptions,
  validateRunOptions,
  validateSourceOptions,
} from "./options.js";
import { unsupported, unsupportedContext } from "./unsupported.js";
import type {
  Context,
  RunningCodeOptions,
  RunningScriptInNewContextOptions,
  RunningScriptOptions,
  ScriptOptions,
} from "./types.js";

// Capture the engine intrinsic once, as the REPL evaluator does. Indirection keeps
// evaluated source out of this module's lexical scope.
const evaluate: (source: string) => unknown = eval;

export class Script {
  #source: string;

  #filename: string;

  #parsed: ParsedScript;

  sourceURL: string | undefined;

  sourceMapURL: string | undefined;

  declare cachedDataRejected: boolean | undefined;

  constructor(code: string, options: ScriptOptions | string = {}) {
    rejectDeprecatedCacheOption(options);

    // Node coerces Script source, but compileFunction requires a string.
    const source = `${code}`;

    const settings = scriptOptions(options);

    this.#filename = validateSourceOptions(settings, "evalmachine.<anonymous>");
    rejectCachedData(settings.cachedData);
    rejectDynamicLoader(settings.importModuleDynamically);

    this.#parsed = parseScript(source);
    this.#source = source;
    this.sourceURL = this.#parsed.sourceURL;
    this.sourceMapURL = this.#parsed.sourceMapURL;
  }

  runInThisContext(options?: RunningScriptOptions): unknown {
    validateRunOptions(options);
    rejectGlobalDeclarations(this.#parsed);

    return evaluate(namedSource(this.#source, this.#parsed.sourceURL ?? this.#filename));
  }

  runInContext(_contextifiedObject: Context, _options?: RunningScriptOptions): unknown {
    return unsupportedContext("vm.Script.runInContext()");
  }

  runInNewContext(
    _contextObject?: Context | symbol,
    _options?: RunningScriptInNewContextOptions,
  ): unknown {
    return unsupportedContext("vm.Script.runInNewContext()");
  }

  createCachedData(): Uint8Array {
    return unsupported(
      "vm.Script.createCachedData()",
      "the guest engine does not expose V8 bytecode caches",
    );
  }
}

export function createScript(code: string, options?: ScriptOptions | string): Script {
  return new Script(code, options);
}

export function runInThisContext(code: string, options?: RunningCodeOptions | string): unknown {
  const script = createScript(code, options);

  // The filename shorthand is accepted by the top-level function, not Script's method.
  return script.runInThisContext(typeof options === "string" ? { filename: options } : options);
}
