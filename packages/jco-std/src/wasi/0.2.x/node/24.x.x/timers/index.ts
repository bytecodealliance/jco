/**
 * Adapted from nodejs/node lib/timers.js, v24.20.0,
 * commit 71b8b174857e25106d39b61a9e6f30d927da8b01 (MIT).
 * TypeScript and engine task timers replace primordials and native scheduling.
 * No native async hooks, process warnings, or private abort event flags.
 */
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

import {
  setTimeout,
  clearTimeout,
  setImmediate,
  clearImmediate,
  setInterval,
  clearInterval,
} from "./callbacks.js";
import promises from "./promises.js";

export {
  setTimeout,
  clearTimeout,
  setImmediate,
  clearImmediate,
  setInterval,
  clearInterval,
  promises,
};
export type { Timeout, Immediate } from "./handles.js";
export type { TimerOptions } from "./promises.js";

const customPromisify = Symbol.for("nodejs.util.promisify.custom");
Object.defineProperty(setTimeout, customPromisify, {
  enumerable: true,
  get: () => promises.setTimeout,
});
Object.defineProperty(setImmediate, customPromisify, {
  enumerable: true,
  get: () => promises.setImmediate,
});

const timers = {
  setTimeout,
  clearTimeout,
  setImmediate,
  clearImmediate,
  setInterval,
  clearInterval,
  get promises() {
    return promises;
  },
};
export default timers;
