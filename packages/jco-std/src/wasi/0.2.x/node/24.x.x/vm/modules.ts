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

import { unsupportedModules } from "./unsupported.js";
import type {
  Context,
  ModuleEvaluateOptions,
  ModuleLinker,
  ModuleOptions,
  ModuleRequest,
  ModuleStatus,
  SourceTextModuleOptions,
  SyntheticModuleEvaluateCallback,
  SyntheticModuleOptions,
} from "./types.js";

/** Preserve the experimental module hierarchy without manufacturing inert modules. */
export class Module {
  constructor(_options?: ModuleOptions) {
    const api =
      new.target.prototype === SourceTextModule.prototype
        ? "vm.SourceTextModule"
        : new.target.prototype === SyntheticModule.prototype
          ? "vm.SyntheticModule"
          : "vm.Module";
    unsupportedModules(api);
  }

  get identifier(): string {
    return unsupportedModules("vm.Module.identifier");
  }

  get context(): Context | undefined {
    return unsupportedModules("vm.Module.context");
  }

  get namespace(): Record<string, unknown> {
    return unsupportedModules("vm.Module.namespace");
  }

  get status(): ModuleStatus {
    return unsupportedModules("vm.Module.status");
  }

  get error(): unknown {
    return unsupportedModules("vm.Module.error");
  }

  link(_linker: ModuleLinker): Promise<void> {
    return unsupportedModules("vm.Module.link()");
  }

  evaluate(_options: ModuleEvaluateOptions = {}): Promise<{ result: unknown }> {
    return unsupportedModules("vm.Module.evaluate()");
  }
}

export class SourceTextModule extends Module {
  constructor(_code: string, _options: SourceTextModuleOptions = {}) {
    super();
  }

  linkRequests(_modules: Module[]): void {
    return unsupportedModules("vm.SourceTextModule.linkRequests()");
  }

  instantiate(): void {
    return unsupportedModules("vm.SourceTextModule.instantiate()");
  }

  get dependencySpecifiers(): readonly string[] {
    return unsupportedModules("vm.SourceTextModule.dependencySpecifiers");
  }

  get moduleRequests(): readonly ModuleRequest[] {
    return unsupportedModules("vm.SourceTextModule.moduleRequests");
  }

  get status(): ModuleStatus {
    return unsupportedModules("vm.SourceTextModule.status");
  }

  get error(): unknown {
    return unsupportedModules("vm.SourceTextModule.error");
  }

  hasAsyncGraph(): boolean {
    return unsupportedModules("vm.SourceTextModule.hasAsyncGraph()");
  }

  hasTopLevelAwait(): boolean {
    return unsupportedModules("vm.SourceTextModule.hasTopLevelAwait()");
  }

  createCachedData(): Uint8Array {
    return unsupportedModules("vm.SourceTextModule.createCachedData()");
  }
}

export class SyntheticModule extends Module {
  constructor(
    _exportNames: string[],
    _evaluateCallback: SyntheticModuleEvaluateCallback,
    _options: SyntheticModuleOptions = {},
  ) {
    super();
  }

  link(_linker: ModuleLinker | undefined = undefined): Promise<void> {
    return unsupportedModules("vm.SyntheticModule.link()");
  }

  setExport(_name: string, _value: unknown): void {
    return unsupportedModules("vm.SyntheticModule.setExport()");
  }
}
