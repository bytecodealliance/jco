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
// 71b8b174857e25106d39b61a9e6f30d927da8b01, src/node_dotenv.cc, Dotenv::ParseContent.
// Local changes: explicit TypeScript contracts, shared Jco errors, ECMAScript intrinsics.

import { invalidArgType } from "../errors/core.js";

const trim = (value: string): string => value.replace(/^[ \t\n]+|[ \t\n]+$/g, "");

export function parseEnv(input: string): Record<string, string> {
  if (typeof input !== "string") {
    throw invalidArgType("content", "string", input);
  }
  let content = trim(input.replaceAll("\r", ""));
  const entries = new Map<string, string>();
  while (content.length) {
    if (content[0] === "\n" || content[0] === "#") {
      const newline = content.indexOf("\n");
      content = newline === -1 ? "" : content.slice(newline + 1);
      continue;
    }
    const equal = content.search(/[=\n]/);
    if (equal === -1) {
      break;
    }
    if (content[equal] === "\n") {
      content = trim(content.slice(equal + 1));
      continue;
    }
    let key = trim(content.slice(0, equal));
    content = content.slice(equal + 1);
    if (!content.length || content[0] === "\n") {
      entries.set(key, "");
      continue;
    }
    content = trim(content);
    if (!key) {
      continue;
    }
    if (key.startsWith("export ")) {
      key = trim(key.slice(7));
    }
    if (!content.length) {
      entries.set(key, "");
      break;
    }
    const quote = content[0];
    if (quote === '"' || quote === "'" || quote === "`") {
      const closing = content.indexOf(quote, 1);
      if (closing !== -1) {
        let value = content.slice(1, closing);
        if (quote === '"') {
          value = value.replaceAll("\\n", "\n");
        }
        entries.set(key, value);
        const newline = content.indexOf("\n", closing + 1);
        content = newline === -1 ? "" : content.slice(newline + 1);
        continue;
      }
      const newline = content.indexOf("\n");
      entries.set(key, newline === -1 ? content : content.slice(0, newline));
      content = newline === -1 ? "" : content.slice(newline + 1);
    } else {
      const newline = content.indexOf("\n");
      let value = newline === -1 ? content : content.slice(0, newline);
      const hash = value.indexOf("#");
      if (hash !== -1) {
        value = value.slice(0, hash);
      }
      entries.set(key, trim(value));
      content = newline === -1 ? "" : content.slice(newline + 1);
    }
    content = trim(content);
  }
  // Node's native binding assigns into an ordinary object; a string assigned
  // to its inherited __proto__ setter does not create an own property.
  entries.delete("__proto__");
  return Object.fromEntries(entries);
}
