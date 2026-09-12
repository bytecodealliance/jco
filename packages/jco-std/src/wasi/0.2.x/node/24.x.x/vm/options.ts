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

import { deprecatedNodeApi, invalidArgType } from "../errors/core.js";
import {
  validateBoolean,
  validateInteger,
  validateObject,
  validateString,
} from "../internal/validation.js";
import { unsupported, unsupportedModules } from "./unsupported.js";
import type { BaseOptions, RunningScriptOptions, ScriptOptions } from "./types.js";

/** Dispatch deprecated options before coercing source or reading option getters. */
export function rejectDeprecatedCacheOption(options: unknown): void {
  if (options !== null && typeof options === "object" && "produceCachedData" in options) {
    throw deprecatedNodeApi(
      "vm.Script options.produceCachedData",
      "Use script.createCachedData() instead",
    );
  }
}

export function scriptOptions(options: ScriptOptions | string = {}): ScriptOptions {
  if (typeof options === "string") {
    return { filename: options };
  }

  validateObject(options, "options");
  return options;
}

export function validateSourceOptions(options: BaseOptions, defaultFilename: string): string {
  const { filename = defaultFilename, lineOffset = 0, columnOffset = 0 } = options;

  validateString(filename, "options.filename");
  validateInteger(lineOffset, "options.lineOffset", -0x8000_0000, 0x7fff_ffff);
  validateInteger(columnOffset, "options.columnOffset", -0x8000_0000, 0x7fff_ffff);

  if (lineOffset !== 0 || columnOffset !== 0) {
    unsupported("vm compilation offsets", "the guest engine cannot apply V8 stack trace offsets");
  }

  return filename;
}

export function rejectCachedData(cachedData: unknown): void {
  if (cachedData === undefined) {
    return;
  }

  if (!ArrayBuffer.isView(cachedData)) {
    throw invalidArgType("options.cachedData", ["Buffer", "TypedArray", "DataView"], cachedData);
  }

  unsupported("vm options.cachedData", "V8 bytecode caches cannot be used by the guest engine");
}

export function rejectDynamicLoader(loader: unknown): void {
  if (loader !== undefined) {
    unsupportedModules("vm options.importModuleDynamically");
  }
}

/** Never accept a watchdog option and then execute without its promised limit. */
export function validateRunOptions(options: RunningScriptOptions = {}): void {
  validateObject(options, "options");

  const { timeout, displayErrors = true, breakOnSigint = false } = options;

  if (timeout !== undefined) {
    validateInteger(timeout, "options.timeout", 1, 0xffff_ffff);
  }

  validateBoolean(displayErrors, "options.displayErrors");
  validateBoolean(breakOnSigint, "options.breakOnSigint");

  if (timeout !== undefined) {
    unsupported("vm options.timeout", "the guest engine has no synchronous execution watchdog");
  }

  if (breakOnSigint) {
    unsupported(
      "vm options.breakOnSigint",
      "host signals cannot interrupt guest JavaScript evaluation",
    );
  }
}
