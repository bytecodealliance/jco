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
// 71b8b174857e25106d39b61a9e6f30d927da8b01, lib/util.js and lib/internal/util/inspect.js.
// Local changes: explicit TypeScript contracts, shared Jco errors, ECMAScript intrinsics.

import {
  invalidArgType,
  invalidArgValue,
  unsupportedNodeApi,
  validateObject,
} from "../errors/core.js";
import { inspect } from "./inspect.js";

export const colors: Record<string, [number, number]> = {
  reset: [0, 0],
  bold: [1, 22],
  dim: [2, 22], // Alias: faint
  italic: [3, 23],
  underline: [4, 24],
  blink: [5, 25],
  // Swap foreground and background colors
  inverse: [7, 27], // Alias: swapcolors, swapColors
  hidden: [8, 28], // Alias: conceal
  strikethrough: [9, 29], // Alias: strikeThrough, crossedout, crossedOut
  doubleunderline: [21, 24], // Alias: doubleUnderline
  black: [30, 39],
  red: [31, 39],
  green: [32, 39],
  yellow: [33, 39],
  blue: [34, 39],
  magenta: [35, 39],
  cyan: [36, 39],
  white: [37, 39],
  bgBlack: [40, 49],
  bgRed: [41, 49],
  bgGreen: [42, 49],
  bgYellow: [43, 49],
  bgBlue: [44, 49],
  bgMagenta: [45, 49],
  bgCyan: [46, 49],
  bgWhite: [47, 49],
  framed: [51, 54],
  overlined: [53, 55],
  gray: [90, 39], // Alias: grey, blackBright
  redBright: [91, 39],
  greenBright: [92, 39],
  yellowBright: [93, 39],
  blueBright: [94, 39],
  magentaBright: [95, 39],
  cyanBright: [96, 39],
  whiteBright: [97, 39],
  bgGray: [100, 49], // Alias: bgGrey, bgBlackBright
  bgRedBright: [101, 49],
  bgGreenBright: [102, 49],
  bgYellowBright: [103, 49],
  bgBlueBright: [104, 49],
  bgMagentaBright: [105, 49],
  bgCyanBright: [106, 49],
  bgWhiteBright: [107, 49],
};

Object.setPrototypeOf(colors, null);

const ansi = new RegExp(
  "[\\u001B\\u009B][[\\]()#;?]*" +
    "(?:(?:(?:(?:;[-a-zA-Z\\d\\/\\#&.:=?%@~_]+)*" +
    "|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/\\#&.:=?%@~_]*)*)?" +
    "(?:\\u0007|\\u001B\\u005C|\\u009C))" +
    "|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?" +
    "[\\dA-PR-TZcf-nq-uy=><~]))",
  "g",
);
for (const [alias, canonical] of Object.entries({
  grey: "gray",
  blackBright: "gray",
  bgGrey: "bgGray",
  bgBlackBright: "bgGray",
  faint: "dim",
  swapcolors: "inverse",
  swapColors: "inverse",
  conceal: "hidden",
  strikeThrough: "strikethrough",
  crossedout: "strikethrough",
  crossedOut: "strikethrough",
  doubleUnderline: "doubleunderline",
})) {
  Object.defineProperty(colors, alias, {
    enumerable: false,
    configurable: true,

    get: (): [number, number] => colors[canonical],

    set: (value: [number, number]): void => {
      colors[canonical] = value;
    },
  });
}
inspect.colors = colors;

export function stripVTControlCharacters(str: string): string {
  if (typeof str !== "string") {
    throw invalidArgType("str", "string", str);
  }
  return str.replace(ansi, "");
}

export function toUSVString(input: unknown): string {
  const text = `${input}`;
  if (typeof text.toWellFormed === "function") {
    return text.toWellFormed();
  }
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        result += text[i] + text[++i];
        continue;
      }
      result += "\ufffd";
    } else {
      result += code >= 0xdc00 && code <= 0xdfff ? "\ufffd" : text[i];
    }
  }
  return result;
}

export interface StyleTextOptions {
  validateStream?: boolean;
  stream?:
    | { isTTY?: boolean; write?: (...args: never[]) => unknown; getColorDepth?: () => number }
    | ReadableStream
    | WritableStream;
}

function replaceClose(text: string, close: string, open: string, keepClose: boolean): string {
  let start = 0,
    result = "";
  for (let index = text.indexOf(close); index !== -1; index = text.indexOf(close, start)) {
    const after = index + close.length;
    if (after >= text.length) {
      break;
    }
    result += text.slice(start, index) + (keepClose ? close + open : open);
    start = after;
  }
  return result + text.slice(start);
}

export function styleText(
  format: string | string[],
  text: string,
  options?: StyleTextOptions,
): string {
  if (typeof text !== "string") {
    throw invalidArgType("text", "string", text);
  }
  if (options !== undefined) {
    validateObject(options, "options");
  }
  const validateStream = options?.validateStream ?? true;
  if (typeof validateStream !== "boolean") {
    throw invalidArgType("options.validateStream", "boolean", validateStream);
  }
  let skip = false;
  if (validateStream) {
    const stream = options?.stream;
    if (!stream) {
      throw unsupportedNodeApi(
        "util.styleText default stream",
        "supply a stream or validateStream: false",
      );
    }
    if (
      typeof stream !== "object" ||
      (!("write" in stream) && !("getReader" in stream) && !("getWriter" in stream))
    ) {
      throw invalidArgType("stream", ["ReadableStream", "WritableStream", "Stream"], stream);
    }
    skip = !("isTTY" in stream && stream.isTTY === true);
  }
  let openCodes = "",
    closeCodes = "",
    processed = text;
  for (const key of Array.isArray(format) ? format : [format]) {
    if (key === "none") {
      continue;
    }
    let open: string,
      close: string,
      keep = false;
    if (typeof key === "string" && key.startsWith("#")) {
      if (!/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(key)) {
        throw invalidArgValue("format", key, "must be a valid hex color (#RGB or #RRGGBB)");
      }
      const hex =
        key.length === 4
          ? key
              .slice(1)
              .split("")
              .map((c) => c + c)
              .join("")
          : key.slice(1);
      const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
      open = `\x1b[38;2;${rgb.join(";")}m`;
      close = "\x1b[39m";
    } else {
      const codes = colors[key];
      if (!codes) {
        throw invalidArgValue(
          "format",
          key,
          `must be one of: ${Object.getOwnPropertyNames(colors).join(", ")}`,
        );
      }
      open = `\x1b[${codes[0]}m`;
      close = `\x1b[${codes[1]}m`;
      keep = codes[0] === 1 || codes[0] === 2;
    }
    openCodes += open;
    closeCodes = close + closeCodes;
    processed = replaceClose(processed, close, open, keep);
  }
  return skip ? text : openCodes + processed + closeCodes;
}
