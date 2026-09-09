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
// 71b8b174857e25106d39b61a9e6f30d927da8b01, lib/internal/readline/emitKeypressEvents.js.
// Local changes: TypeScript types, ES intrinsics, portable errors and scheduling.
// See ./README.md for runtime boundaries and the upstream dependency audit.

import { unsupportedNodeApi } from "../errors.js";
import { StringDecoder } from "../string-decoder.js";
import { charLengthAt, CSI, emitKeys } from "./utils.js";
import { kSawKeyPress } from "./interface.js";
import type { ReadableInput } from "./types.js";
const { kEscape } = CSI;
interface KeypressInterface {
  escapeCodeTimeout?: number;
  isCompletionEnabled?: boolean;
  [kSawKeyPress]?: boolean;
}
const states = new WeakMap<
  ReadableInput,
  { decoder: StringDecoder; escape: Generator<void, void, string> }
>();
// GNU readline library - keyseq-timeout is 500ms (default)
const ESCAPE_CODE_TIMEOUT = 500;
/**
 * accepts a readable Stream instance and makes it emit "keypress" events
 */
export function emitKeypressEvents(stream: ReadableInput, iface: KeypressInterface = {}): void {
  if (states.has(stream)) {
    return;
  }
  const state = { decoder: new StringDecoder("utf8"), escape: emitKeys(stream) };
  states.set(stream, state);
  state.escape = emitKeys(stream);
  state.escape.next();
  const triggerEscape = () => state.escape.next("");
  const { escapeCodeTimeout = ESCAPE_CODE_TIMEOUT } = iface;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  function onData(input: string | ArrayBufferView) {
    if (stream.listenerCount("keypress") > 0) {
      const string = state.decoder.write(input);
      if (string) {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }
        // This supports characters of length 2.
        iface[kSawKeyPress] = charLengthAt(string, 0) === string.length;
        iface.isCompletionEnabled = false;
        let length = 0;
        for (const character of string) {
          length += character.length;
          if (length === string.length) {
            iface.isCompletionEnabled = true;
          }
          try {
            state.escape.next(character);
            // Escape letter at the tail position
            if (length === string.length && character === kEscape) {
              if (typeof setTimeout !== "function") {
                throw unsupportedNodeApi(
                  "readline escapeCodeTimeout",
                  "this engine does not provide timers",
                );
              }
              timeoutId = setTimeout(triggerEscape, escapeCodeTimeout);
            }
          } catch (err) {
            // If the generator throws (it could happen in the `keypress`
            // event), we need to restart it.
            state.escape = emitKeys(stream);
            state.escape.next();
            throw err;
          }
        }
      }
    } else {
      // Nobody's watching anyway
      stream.removeListener("data", onData);
      stream.on("newListener", onNewListener);
    }
  }
  function onNewListener(event: string) {
    if (event === "keypress") {
      stream.on("data", onData);
      stream.removeListener("newListener", onNewListener);
    }
  }
  if (stream.listenerCount("keypress") > 0) {
    stream.on("data", onData);
  } else {
    stream.on("newListener", onNewListener);
  }
}
