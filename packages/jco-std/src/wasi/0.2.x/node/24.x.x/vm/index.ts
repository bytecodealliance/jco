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

import { Script, createScript, runInThisContext } from "./script.js";
import { compileFunction } from "./compile-function.js";
import { constants } from "./constants.js";
import {
  createContext,
  isContext,
  measureMemory,
  runInContext,
  runInNewContext,
} from "./contexts.js";
import { Module, SourceTextModule, SyntheticModule } from "./modules.js";

export {
  Script,
  createScript,
  runInThisContext,
  compileFunction,
  constants,
  createContext,
  isContext,
  measureMemory,
  runInContext,
  runInNewContext,
  Module,
  SourceTextModule,
  SyntheticModule,
};

export type * from "./types.js";

const vm = {
  Script,
  createContext,
  createScript,
  runInContext,
  runInNewContext,
  runInThisContext,
  isContext,
  compileFunction,
  measureMemory,
  constants,
  Module,
  SourceTextModule,
  SyntheticModule,
};

export default vm;
