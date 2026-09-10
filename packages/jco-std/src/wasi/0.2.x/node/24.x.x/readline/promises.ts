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
// 71b8b174857e25106d39b61a9e6f30d927da8b01, lib/readline/promises.js.
// Local changes: TypeScript types, ES intrinsics, portable errors and scheduling.
// See ./README.md for runtime boundaries and the upstream dependency audit.

import { addAbortListener } from "node:events";
import { AbortError } from "../errors.js";
import { validateAbortSignal } from "./compat.js";
import { InterfaceCore, kQuestion, kQuestionCancel, kQuestionReject } from "./interface.js";
import { Readline } from "./actions.js";
import type { ReadableInput, WritableOutput, InterfaceOptions, QuestionOptions } from "./types.js";
export { Readline };

export class Interface extends InterfaceCore {
  question(query: string, options: QuestionOptions = {}): Promise<string> {
    return new Promise((resolve, reject) => {
      let cb = resolve;
      if (options?.signal) {
        const signal = options.signal;
        validateAbortSignal(signal, "options.signal");
        if (signal.aborted) {
          reject(new AbortError(undefined, { cause: signal.reason }));
          return;
        }

        const onAbort = () => {
          this[kQuestionCancel]();
          reject(new AbortError(undefined, { cause: signal.reason }));
        };

        const disposable = addAbortListener(signal, onAbort);
        cb = (answer) => {
          disposable[Symbol.dispose]();
          resolve(answer);
        };
      }
      this[kQuestionReject] = reject;
      this[kQuestion](query, cb);
    });
  }
}

export function createInterface(options: InterfaceOptions): Interface;

export function createInterface(
  input: ReadableInput,
  output?: WritableOutput | null,
  completer?: InterfaceOptions["completer"],
  terminal?: boolean,
): Interface;

export function createInterface(
  input: ReadableInput | InterfaceOptions,
  output?: WritableOutput | null,
  completer?: InterfaceOptions["completer"],
  terminal?: boolean,
): Interface {
  return new Interface(input, output, completer, terminal);
}

const promises = { Interface, Readline, createInterface };
export default promises;
