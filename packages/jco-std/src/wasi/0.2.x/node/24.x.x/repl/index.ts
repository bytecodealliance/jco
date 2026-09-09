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
// 71b8b174857e25106d39b61a9e6f30d927da8b01, lib/repl.js (module shape).
// Local changes: ESM namespace; the deprecated `builtinModules`/`_builtinLibs` accessors live on
// the default export only, since an ES module binding cannot be an accessor.
// See ./README.md for runtime boundaries and the upstream dependency audit.

import {
  REPLServer,
  REPL_MODE_SLOPPY,
  REPL_MODE_STRICT,
  Recoverable,
  isValidSyntax,
  start,
  writer,
} from "./server.js";
import { getReplBuiltinLibs, setReplBuiltinLibs } from "./utils.js";

export {
  REPLServer,
  REPL_MODE_SLOPPY,
  REPL_MODE_STRICT,
  Recoverable,
  isValidSyntax,
  start,
  writer,
};
export type {
  REPLServer as REPLServerInstance,
  REPLServerConstructor,
  ReplWriter,
} from "./server.js";
export type * from "./types.js";

/** The module object, matching what `require("node:repl")` yields. */
export interface ReplModule {
  start: typeof start;
  writer: typeof writer;
  REPLServer: typeof REPLServer;
  REPL_MODE_SLOPPY: typeof REPL_MODE_SLOPPY;
  REPL_MODE_STRICT: typeof REPL_MODE_STRICT;
  Recoverable: typeof Recoverable;
  isValidSyntax: typeof isValidSyntax;
  /** Deprecated upstream (DEP0191, documentation-only); `module.builtinModules` is the replacement. */
  builtinModules: string[];
  /** Deprecated upstream (DEP0142, documentation-only); an alias of `builtinModules`. */
  _builtinLibs: string[];
}

const repl = {
  start,
  writer,
  REPLServer,
  REPL_MODE_SLOPPY,
  REPL_MODE_STRICT,
  Recoverable,
  isValidSyntax,
} as ReplModule;

for (const name of ["builtinModules", "_builtinLibs"] as const) {
  Object.defineProperty(repl, name, {
    get: () => getReplBuiltinLibs(),
    set: (value: string[]) => setReplBuiltinLibs(value),
    enumerable: false,
    configurable: true,
  });
}

export default repl;
