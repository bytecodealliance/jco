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
// 71b8b174857e25106d39b61a9e6f30d927da8b01, lib/internal/mime.js.
// Local changes: explicit TypeScript contracts, shared Jco errors, ECMAScript intrinsics.
import { codedError } from "../errors/core.js";

function mimeError(production: string, str: string, invalidIndex: number): TypeError {
  return codedError(
    new TypeError(
      `The MIME syntax for a ${production} in "${str}" is invalid${invalidIndex !== -1 ? ` at ${invalidIndex}` : ""}`,
    ),
    "ERR_INVALID_MIME_SYNTAX",
  );
}

const NOT_HTTP_TOKEN_CODE_POINT = /[^!#$%&'*+\-.^_`|~A-Za-z0-9]/g;
const NOT_HTTP_QUOTED_STRING_CODE_POINT = /[^\t\u0020-~\u0080-\u00FF]/g;
const END_BEGINNING_WHITESPACE = /[^\r\n\t ]|$/;
const START_ENDING_WHITESPACE = /[\r\n\t ]*$/;

function toASCIILower(str: string): string {
  // eslint-disable-next-line no-control-regex
  if (!/[^\x00-\x7f]/.test(str)) {
    return str.toLowerCase();
  }
  let result = "";
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    result += char >= "A" && char <= "Z" ? char.toLowerCase() : char;
  }
  return result;
}

const SOLIDUS = "/";
const SEMICOLON = ";";

function parseTypeAndSubtype(str: string): [string, string, number] {
  // Skip only HTTP whitespace from start
  let position = str.search(END_BEGINNING_WHITESPACE);
  // read until '/'
  const typeEnd = str.indexOf(SOLIDUS, position);
  const trimmedType = typeEnd === -1 ? str.slice(position) : str.slice(position, typeEnd);
  const invalidTypeIndex = trimmedType.search(NOT_HTTP_TOKEN_CODE_POINT);
  if (trimmedType === "" || invalidTypeIndex !== -1 || typeEnd === -1) {
    throw mimeError("type", str, invalidTypeIndex);
  }
  // skip type and '/'
  position = typeEnd + 1;
  const type = toASCIILower(trimmedType);
  // read until ';'
  const subtypeEnd = str.indexOf(SEMICOLON, position);
  const rawSubtype = subtypeEnd === -1 ? str.slice(position) : str.slice(position, subtypeEnd);
  position += rawSubtype.length;
  if (subtypeEnd !== -1) {
    // skip ';'
    position += 1;
  }
  const trimmedSubtype = rawSubtype.slice(0, rawSubtype.search(START_ENDING_WHITESPACE));
  const invalidSubtypeIndex = trimmedSubtype.search(NOT_HTTP_TOKEN_CODE_POINT);
  if (trimmedSubtype === "" || invalidSubtypeIndex !== -1) {
    throw mimeError("subtype", str, invalidSubtypeIndex);
  }
  const subtype = toASCIILower(trimmedSubtype);
  return [type, subtype, position];
}

const EQUALS_SEMICOLON_OR_END = /[;=]|$/;
const QUOTED_VALUE_PATTERN = /^(?:([\\]$)|[\\][\s\S]|[^"])*(?:(")|$)/u;

function removeBackslashes(str: string): string {
  let ret = "";
  // We stop at str.length - 1 because we want to look ahead one character.
  let i;
  for (i = 0; i < str.length - 1; i++) {
    const c = str[i];
    if (c === "\\") {
      i++;
      ret += str[i];
    } else {
      ret += c;
    }
  }
  // We add the last character if we didn't skip to it.
  if (i === str.length - 1) {
    ret += str[i];
  }
  return ret;
}

function escapeQuoteOrSolidus(str: string): string {
  let result = "";
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    result += char === '"' || char === "\\" ? `\\${char}` : char;
  }
  return result;
}

const encode = (value: string): string => {
  if (value.length === 0) {
    return '""';
  }
  const encode = value.search(NOT_HTTP_TOKEN_CODE_POINT) !== -1;
  if (!encode) {
    return value;
  }
  const escaped = escapeQuoteOrSolidus(value);
  return `"${escaped}"`;
};

let instantiateMimeParams: (str: string) => MIMEParams;

export class MIMEParams {
  declare [Symbol.iterator]: () => IterableIterator<[string, string]>;
  declare toJSON: () => string;
  #data = new Map<string, string>();
  // We set the flag the MIMEParams instance as processed on initialization
  // to defer the parsing of a potentially large string.
  #processed = true;
  #string = "";
  /**
   * Used to instantiate a MIMEParams object within the MIMEType class and
   * to allow it to be parsed lazily.
   * @returns {MIMEParams}
   */
  static {
    instantiateMimeParams = (str: string): MIMEParams => {
      const instance = new MIMEParams();
      instance.#string = str;
      instance.#processed = false;
      return instance;
    };
  }

  /**
   * @param {string} name
   * @returns {void}
   */
  delete(name: string): void {
    this.#parse();
    this.#data.delete(toASCIILower(`${name}`));
  }

  get(name: string): string | null {
    this.#parse();
    const data = this.#data;
    name = toASCIILower(`${name}`);
    if (data.has(name)) {
      return data.get(name)!;
    }
    return null;
  }

  has(name: string): boolean {
    this.#parse();
    return this.#data.has(toASCIILower(`${name}`));
  }

  set(name: string, value: string): void {
    this.#parse();
    const data = this.#data;
    name = toASCIILower(`${name}`);
    value = `${value}`;
    const invalidNameIndex = name.search(NOT_HTTP_TOKEN_CODE_POINT);
    if (name.length === 0 || invalidNameIndex !== -1) {
      throw mimeError("parameter name", name, invalidNameIndex);
    }
    const invalidValueIndex = value.search(NOT_HTTP_QUOTED_STRING_CODE_POINT);
    if (invalidValueIndex !== -1) {
      throw mimeError("parameter value", value, invalidValueIndex);
    }
    data.set(name, value);
  }

  *entries(): IterableIterator<[string, string]> {
    this.#parse();
    yield* this.#data.entries();
  }

  *keys(): IterableIterator<string> {
    this.#parse();
    yield* this.#data.keys();
  }

  *values(): IterableIterator<string> {
    this.#parse();
    yield* this.#data.values();
  }

  toString(): string {
    this.#parse();
    let ret = "";
    for (const { 0: key, 1: value } of this.#data) {
      const encoded = encode(value);
      // Ensure they are separated
      if (ret.length) {
        ret += ";";
      }
      ret += `${key}=${encoded}`;
    }
    return ret;
  }

  // Used to act as a friendly class to stringifying stuff
  // not meant to be exposed to users, could inject invalid values
  #parse(): void {
    if (this.#processed) {
      return;
    } // already parsed
    const paramsMap = this.#data;
    let position = 0;
    const str = this.#string;
    const endOfSource = str.slice(position).search(START_ENDING_WHITESPACE) + position;
    while (position < endOfSource) {
      // Skip any whitespace before parameter
      position += str.slice(position).search(END_BEGINNING_WHITESPACE);
      // Read until ';' or '='
      const afterParameterName = str.slice(position).search(EQUALS_SEMICOLON_OR_END) + position;
      const parameterString = toASCIILower(str.slice(position, afterParameterName));
      position = afterParameterName;
      // If we found a terminating character
      if (position < endOfSource) {
        // Safe to use because we never do special actions for surrogate pairs
        const char = str.charAt(position);
        // Skip the terminating character
        position += 1;
        // Ignore parameters without values
        if (char === ";") {
          continue;
        }
      }
      // If we are at end of the string, it cannot have a value
      if (position >= endOfSource) {
        break;
      }
      // Safe to use because we never do special actions for surrogate pairs
      const char = str.charAt(position);
      let parameterValue = null;
      if (char === '"') {
        // Handle quoted-string form of values
        // skip '"'
        position += 1;
        // Find matching closing '"' or end of string
        //   use $1 to see if we terminated on unmatched '\'
        //   use $2 to see if we terminated on a matching '"'
        //   so we can skip the last char in either case
        const insideMatch = QUOTED_VALUE_PATTERN.exec(str.slice(position))!;
        position += insideMatch[0].length;
        // Skip including last character if an unmatched '\' or '"' during
        // unescape
        const inside =
          insideMatch[1] || insideMatch[2] ? insideMatch[0].slice(0, -1) : insideMatch[0];
        // Unescape '\' quoted characters
        parameterValue = removeBackslashes(inside);
        // If we did have an unmatched '\' add it back to the end
        if (insideMatch[1]) {
          parameterValue += "\\";
        }
      } else {
        // Handle the normal parameter value form
        const valueEnd = str.indexOf(SEMICOLON, position);
        const rawValue = valueEnd === -1 ? str.slice(position) : str.slice(position, valueEnd);
        position += rawValue.length;
        const trimmedValue = rawValue.slice(0, rawValue.search(START_ENDING_WHITESPACE));
        // Ignore parameters without values
        if (trimmedValue === "") {
          continue;
        }
        parameterValue = trimmedValue;
      }
      if (
        parameterString !== "" &&
        parameterString.search(NOT_HTTP_TOKEN_CODE_POINT) === -1 &&
        parameterValue.search(NOT_HTTP_QUOTED_STRING_CODE_POINT) === -1 &&
        paramsMap.has(parameterString) === false
      ) {
        paramsMap.set(parameterString, parameterValue);
      }
      position++;
    }
    this.#data = paramsMap;
    this.#processed = true;
  }
}

const MIMEParamsStringify = MIMEParams.prototype.toString;
Object.defineProperty(MIMEParams.prototype, Symbol.iterator, {
  configurable: true,
  value: MIMEParams.prototype.entries,
  writable: true,
});
Object.defineProperty(MIMEParams.prototype, "toJSON", {
  configurable: true,
  value: MIMEParamsStringify,
  writable: true,
});

export class MIMEType {
  declare toJSON: () => string;
  #type: string;
  #subtype: string;
  #parameters: MIMEParams;

  constructor(string: string) {
    string = `${string}`;
    const data = parseTypeAndSubtype(string);
    this.#type = data[0];
    this.#subtype = data[1];
    this.#parameters = instantiateMimeParams(string.slice(data[2]));
  }

  get type(): string {
    return this.#type;
  }

  set type(v: string) {
    v = `${v}`;
    const invalidTypeIndex = v.search(NOT_HTTP_TOKEN_CODE_POINT);
    if (v.length === 0 || invalidTypeIndex !== -1) {
      throw mimeError("type", v, invalidTypeIndex);
    }
    this.#type = toASCIILower(v);
  }

  get subtype(): string {
    return this.#subtype;
  }

  set subtype(v: string) {
    v = `${v}`;
    const invalidSubtypeIndex = v.search(NOT_HTTP_TOKEN_CODE_POINT);
    if (v.length === 0 || invalidSubtypeIndex !== -1) {
      throw mimeError("subtype", v, invalidSubtypeIndex);
    }
    this.#subtype = toASCIILower(v);
  }

  get essence(): string {
    return `${this.#type}/${this.#subtype}`;
  }

  get params(): MIMEParams {
    return this.#parameters;
  }

  toString(): string {
    let ret = `${this.#type}/${this.#subtype}`;
    const paramStr = MIMEParamsStringify.call(this.#parameters);
    if (paramStr.length) {
      ret += `;${paramStr}`;
    }
    return ret;
  }
}

Object.defineProperty(MIMEType.prototype, "toJSON", {
  configurable: true,
  value: MIMEType.prototype.toString,
  writable: true,
});
