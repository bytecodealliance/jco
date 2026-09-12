// MIT License
//
// Copyright (c) Microsoft Corporation.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE

// Public signatures adapted from @types/node 24.13.3 vm.d.ts (MIT, DefinitelyTyped).
// Local changes: self-contained types and unknown for arbitrary evaluated JS values.
import type { Module, Script, SyntheticModule } from "./index.js";

export interface Context {
  [key: string]: unknown;
}

export interface BaseOptions {
  filename?: string;
  lineOffset?: number;
  columnOffset?: number;
}

export type ImportAttributes = Record<string, string>;

export type DynamicModuleLoader<T> = (
  specifier: string,
  referrer: T,
  importAttributes: ImportAttributes,
  phase: "source" | "evaluation",
) => Module | Promise<Module>;

export interface ScriptOptions extends BaseOptions {
  cachedData?: ArrayBufferView;
  /** @deprecated Use Script.createCachedData(); native caches are unsupported here. */
  produceCachedData?: boolean;
  importModuleDynamically?: DynamicModuleLoader<Script> | symbol;
}

export interface RunningScriptOptions extends BaseOptions {
  displayErrors?: boolean;
  timeout?: number;
  breakOnSigint?: boolean;
}

export interface RunningCodeOptions extends RunningScriptOptions, ScriptOptions {}

export interface CreateContextOptions {
  name?: string;
  origin?: string;
  codeGeneration?: { strings?: boolean; wasm?: boolean };
  microtaskMode?: "afterEvaluate";
  importModuleDynamically?: DynamicModuleLoader<Context> | symbol;
}

export interface RunningScriptInNewContextOptions extends RunningScriptOptions {
  contextName?: string;
  contextOrigin?: string;
  contextCodeGeneration?: CreateContextOptions["codeGeneration"];
  microtaskMode?: "afterEvaluate";
}

export interface RunningCodeInNewContextOptions
  extends RunningScriptInNewContextOptions, ScriptOptions {}

/** The returned function runs in the guest's global scope, without a local closure. */
export type CompiledFunction = ((...args: unknown[]) => unknown) & {
  cachedData?: Uint8Array;
  cachedDataProduced?: boolean;
  cachedDataRejected?: boolean;
};

export interface CompileFunctionOptions extends BaseOptions {
  cachedData?: ArrayBufferView;
  produceCachedData?: boolean;
  parsingContext?: Context;
  contextExtensions?: (object | null)[];
  importModuleDynamically?: DynamicModuleLoader<CompiledFunction> | symbol;
}

export interface MeasureMemoryOptions {
  mode?: "summary" | "detailed";
  execution?: "default" | "eager";
}

export interface MemoryMeasurement {
  total: { jsMemoryEstimate: number; jsMemoryRange: [number, number] };
  current?: { jsMemoryEstimate: number; jsMemoryRange: [number, number] };
  other?: { jsMemoryEstimate: number; jsMemoryRange: [number, number] }[];
}

export interface ModuleEvaluateOptions {
  timeout?: number;
  breakOnSigint?: boolean;
}

export type ModuleStatus =
  | "unlinked"
  | "linking"
  | "linked"
  | "evaluating"
  | "evaluated"
  | "errored";

export type ModuleLinker = (
  specifier: string,
  referencingModule: Module,
  extra: { attributes: ImportAttributes; assert: ImportAttributes },
) => Module | Promise<Module>;

export interface ModuleRequest {
  specifier: string;
  attributes: ImportAttributes;
  phase: "source" | "evaluation";
}

export interface ModuleOptions {
  identifier?: string;
  context?: Context;
}

export interface SourceTextModuleOptions extends BaseOptions, ModuleOptions {
  cachedData?: ArrayBufferView;
  initializeImportMeta?: (meta: Record<string, unknown>, module: Module) => void;
  importModuleDynamically?: DynamicModuleLoader<Module>;
}

export type SyntheticModuleOptions = ModuleOptions;

export type SyntheticModuleEvaluateCallback = (this: SyntheticModule) => void;
