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
// 71b8b174857e25106d39b61a9e6f30d927da8b01, lib/internal/readline/promises.js.
// Local changes: TypeScript types, ES intrinsics, portable errors and scheduling.
// See ./README.md for runtime boundaries.

import { defer } from "./compat.js";
import { CSI } from "./utils.js";
import { validateBoolean, validateInteger, isWritable } from "./compat.js";
import { invalidArgType } from "../errors.js";
import type { WritableOutput } from "./types.js";
const { kClearToLineBeginning, kClearToLineEnd, kClearLine, kClearScreenDown } = CSI;

export class Readline {
  #autoCommit = false;
  #stream: WritableOutput;
  #todo: string[] = [];

  constructor(stream: WritableOutput, options: { autoCommit?: boolean } | undefined = undefined) {
    if (!isWritable(stream)) {
      throw invalidArgType("stream", "Writable", stream);
    }
    this.#stream = stream;
    if (options?.autoCommit != null) {
      validateBoolean(options.autoCommit, "options.autoCommit");
      this.#autoCommit = options.autoCommit;
    }
  }

  /**
   * Moves the cursor to the x and y coordinate on the given stream.
   * @param {integer} x
   * @param {integer} [y]
   * @returns {Readline} this
   */
  cursorTo(x: number, y?: number): this {
    validateInteger(x, "x");
    if (y != null) {
      validateInteger(y, "y");
    }
    const data = y == null ? CSI`${x + 1}G` : CSI`${y + 1};${x + 1}H`;
    if (this.#autoCommit) {
      defer(() => this.#stream.write(data));
    } else {
      this.#todo.push(data);
    }
    return this;
  }

  /**
   * Moves the cursor relative to its current location.
   * @param {integer} dx
   * @param {integer} dy
   * @returns {Readline} this
   */
  moveCursor(dx: number, dy: number): this {
    if (dx || dy) {
      validateInteger(dx, "dx");
      validateInteger(dy, "dy");
      let data = "";
      if (dx < 0) {
        data += CSI`${-dx}D`;
      } else if (dx > 0) {
        data += CSI`${dx}C`;
      }
      if (dy < 0) {
        data += CSI`${-dy}A`;
      } else if (dy > 0) {
        data += CSI`${dy}B`;
      }
      if (this.#autoCommit) {
        defer(() => this.#stream.write(data));
      } else {
        this.#todo.push(data);
      }
    }
    return this;
  }

  /**
   * Clears the current line the cursor is on.
   * @param {-1|0|1} dir Direction to clear:
   *   -1 for left of the cursor
   *   +1 for right of the cursor
   *   0 for the entire line
   * @returns {Readline} this
   */
  clearLine(dir: number): this {
    validateInteger(dir, "dir", -1, 1);
    const data = dir < 0 ? kClearToLineBeginning : dir > 0 ? kClearToLineEnd : kClearLine;
    if (this.#autoCommit) {
      defer(() => this.#stream.write(data));
    } else {
      this.#todo.push(data);
    }
    return this;
  }

  /**
   * Clears the screen from the current position of the cursor down.
   * @returns {Readline} this
   */
  clearScreenDown(): this {
    if (this.#autoCommit) {
      defer(() => this.#stream.write(kClearScreenDown));
    } else {
      this.#todo.push(kClearScreenDown);
    }
    return this;
  }

  /**
   * Sends all the pending actions to the associated `stream` and clears the
   * internal list of pending actions.
   * @returns {Promise<void>} Resolves when all pending actions have been
   *   flushed to the associated `stream`.
   */
  commit(): Promise<void> {
    return new Promise<void>((resolve) => {
      // Node resolves with the write callback argument (even an error), although
      // its public TypeScript contract is Promise<void>.
      this.#stream.write(this.#todo.join(""), (error) => {
        Reflect.apply(resolve, undefined, [error]);
      });
      this.#todo = [];
    });
  }

  /**
   * Clears the internal list of pending actions without sending it to the
   * associated `stream`.
   * @returns {Readline} this
   */
  rollback(): this {
    this.#todo = [];
    return this;
  }
}
