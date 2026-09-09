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
// 71b8b174857e25106d39b61a9e6f30d927da8b01, lib/repl.js (`Recoverable`) and
// lib/internal/repl.js. Local changes: TypeScript types; split into its own module so the
// evaluator, the await rewriter and the module entry share one identity without a cycle.
// See ./README.md for runtime boundaries and the upstream dependency audit.

/**
 * A syntax error the REPL can recover from by reading more input.
 *
 * Node's class is a plain function whose prototype chain is grafted onto `SyntaxError`; instances
 * therefore have no own `message` or `stack`, only `err`. That shape is preserved exactly.
 */
export interface Recoverable extends SyntaxError {
  err: Error;
}

export interface RecoverableConstructor {
  new (err: Error): Recoverable;
  prototype: Recoverable;
}

export const Recoverable: RecoverableConstructor = function Recoverable(
  this: Recoverable,
  err: Error,
) {
  this.err = err;
} as unknown as RecoverableConstructor;
Object.setPrototypeOf(Recoverable.prototype, SyntaxError.prototype);
Object.setPrototypeOf(Recoverable, SyntaxError);
