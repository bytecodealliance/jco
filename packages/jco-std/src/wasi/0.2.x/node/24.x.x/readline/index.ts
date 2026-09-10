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
// 71b8b174857e25106d39b61a9e6f30d927da8b01, lib/readline.js.
// Local changes: TypeScript types, ES intrinsics, portable errors and scheduling.
// See ./README.md for runtime boundaries and the upstream dependency audit.

import { addAbortListener } from "node:events";
import { AbortError } from "../errors.js";
import { validateAbortSignal, inspect } from "./compat.js";
import {
  InterfaceCore,
  kQuestion,
  kQuestionCancel,
  kTabComplete,
  kTabCompleter,
} from "./interface.js";
import * as core from "./interface.js";
import { clearLine, clearScreenDown, cursorTo, moveCursor } from "./callbacks.js";
import { emitKeypressEvents } from "./keypress.js";
import promises from "./promises.js";
import type {
  ReadableInput,
  WritableOutput,
  InterfaceOptions,
  QuestionOptions,
  AsyncCompleter,
  Completer,
} from "./types.js";
export { clearLine, clearScreenDown, cursorTo, moveCursor, emitKeypressEvents, promises };
export type * from "./types.js";

class CallbackInterface extends InterfaceCore {
  constructor(
    input: ReadableInput | InterfaceOptions,
    output?: WritableOutput | null,
    completer?: InterfaceOptions["completer"],
    terminal?: boolean,
  ) {
    if (
      input &&
      "input" in input &&
      typeof input.completer === "function" &&
      input.completer.length !== 2
    ) {
      const original = input.completer as Completer;
      input.completer = (v, cb) => cb(null, original(v));
    } else if (typeof completer === "function" && completer.length !== 2) {
      const original = completer as Completer;
      completer = (v, cb) => cb(null, original(v));
    }
    super(input, output, completer, terminal);
  }

  question(query: string, callback: (answer: string) => void): void;

  question(query: string, options: QuestionOptions, callback: (answer: string) => void): void;

  question(
    query: string,
    options: QuestionOptions | ((answer: string) => void),
    callback?: (answer: string) => void,
  ): void {
    let cb = typeof options === "function" ? options : callback;
    const opts = options !== null && typeof options === "object" ? options : {};
    if (opts.signal) {
      validateAbortSignal(opts.signal, "options.signal");
      if (opts.signal.aborted) {
        return;
      }
      const disposable = addAbortListener(opts.signal, () => this[kQuestionCancel]());
      const original = cb;
      cb =
        typeof original === "function"
          ? (answer) => {
              disposable[Symbol.dispose]();
              original(answer);
            }
          : () => disposable[Symbol.dispose]();
    }
    if (typeof cb === "function") {
      this[kQuestion](query, cb);
    }
  }
}

export type Interface = CallbackInterface;

export interface InterfaceConstructor {
  new (options: InterfaceOptions): Interface;

  new (
    input: ReadableInput,
    output?: WritableOutput | null,
    completer?: InterfaceOptions["completer"],
    terminal?: boolean,
  ): Interface;

  (options: InterfaceOptions): Interface;

  (
    input: ReadableInput,
    output?: WritableOutput | null,
    completer?: InterfaceOptions["completer"],
    terminal?: boolean,
  ): Interface;

  prototype: Interface;
}

// Node's callback constructor remains callable without new and supports subclassing.
export const Interface: InterfaceConstructor = function Interface(
  input: ReadableInput | InterfaceOptions,
  output?: WritableOutput | null,
  completer?: InterfaceOptions["completer"],
  terminal?: boolean,
): Interface {
  return Reflect.construct(
    CallbackInterface,
    [input, output, completer, terminal],
    new.target || Interface,
  );
} as InterfaceConstructor;

Interface.prototype = CallbackInterface.prototype;
Object.defineProperty(Interface.prototype, "constructor", {
  value: Interface,
  writable: true,
  configurable: true,
});
Object.setPrototypeOf(Interface, InterfaceCore);

Object.defineProperty(Interface.prototype, "question", { enumerable: true });
Object.defineProperty(Interface.prototype.question, Symbol.for("nodejs.util.promisify.custom"), {
  configurable: true,
  writable: true,
  enumerable: true,

  value: function question(
    this: Interface,
    query: string,
    options: QuestionOptions = {},
  ): Promise<string> {
    if (options?.signal?.aborted) {
      return Promise.reject(new AbortError(undefined, { cause: options.signal.reason }));
    }
    return new Promise((resolve, reject) => {
      let cb = resolve;
      if (options?.signal) {
        const signal = options.signal;
        const disposable = addAbortListener(signal, () =>
          reject(new AbortError(undefined, { cause: signal.reason })),
        );
        cb = (answer) => {
          disposable[Symbol.dispose]();
          resolve(answer);
        };
      }
      this.question(query, options, cb);
    });
  },
});

// Preserve Node's historical underscore hooks and symbol redirects without exporting them.
const methods = [
  "kSetRawMode",
  "kOnLine",
  "kWriteToOutput",
  "kAddHistory",
  "kRefreshLine",
  "kNormalWrite",
  "kInsertString",
  "kWordLeft",
  "kWordRight",
  "kDeleteLeft",
  "kDeleteRight",
  "kDeleteWordLeft",
  "kDeleteWordRight",
  "kDeleteLineLeft",
  "kDeleteLineRight",
  "kLine",
  "kHistoryNext",
  "kHistoryPrev",
  "kGetDisplayPos",
  "kMoveCursor",
  "kTtyWrite",
] as const;
for (const name of methods) {
  const symbol = core[name];
  const publicName = "_" + name[1].toLowerCase() + name.slice(2);
  Object.defineProperty(Interface.prototype, publicName, {
    value: InterfaceCore.prototype[symbol],
    enumerable: true,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(Interface.prototype, symbol, {
    get(this: Interface) {
      return Reflect.get(this, publicName);
    },
  });
}
for (const name of [
  "kDecoder",
  "kLine_buffer",
  "kOldPrompt",
  "kPreviousKey",
  "kPrompt",
  "kQuestionCallback",
  "kSawKeyPress",
  "kSawReturnAt",
] as const) {
  const symbol = core[name];
  const publicName = "_" + name[1].toLowerCase() + name.slice(2);
  Object.defineProperty(Interface.prototype, publicName, {
    get(this: Interface) {
      return Reflect.get(this, symbol);
    },

    set(this: Interface, value: unknown) {
      Reflect.set(this, symbol, value);
    },
  });
}
Object.defineProperty(Interface.prototype, "_getCursorPos", {
  value: InterfaceCore.prototype.getCursorPos,
  enumerable: true,
  configurable: true,
  writable: true,
});
Object.defineProperty(Interface.prototype, "_tabComplete", {
  configurable: true,
  writable: true,
  enumerable: true,

  value: function (this: Interface, lastKeypressWasTab: boolean): void {
    this.pause();
    const line = this.line.slice(0, this.cursor);
    (this.completer as AsyncCompleter)(line, (err, value) => {
      this.resume();
      if (err) {
        this[core.kWriteToOutput](`Tab completion error: ${inspect(err)}`);
        return;
      }
      this[kTabCompleter](lastKeypressWasTab, value!);
    });
  },
});
Object.defineProperty(Interface.prototype, kTabComplete, {
  get(this: Interface) {
    return Reflect.get(this, "_tabComplete");
  },
});

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
  return Reflect.construct(Interface, [input, output, completer, terminal]);
}

const readline = {
  Interface,
  clearLine,
  clearScreenDown,
  createInterface,
  cursorTo,
  emitKeypressEvents,
  moveCursor,
  promises,
};
export default readline;
