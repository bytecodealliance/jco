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

/**
 * Node v24.20.0 lib/internal/url.js domain conversion contract, commit
 * 71b8b174857e25106d39b61a9e6f30d927da8b01 (MIT, see LICENSE).
 * Ada's host parser is replaced with WHATWG URL host parsing (UTS46, IPv4,
 * IPv6 and forbidden characters); punycode@2.3.1 only decodes validated hosts.
 */
import punycode from "punycode/punycode.js";
import { missingArgs } from "../errors.js";
import { URL } from "./whatwg.js";

export function domainToASCII(domain: string): string {
  if (arguments.length === 0) {
    throw missingArgs("domain");
  }
  const text = `${domain}`;
  if (!text) {
    return "";
  }
  const url = new URL("http://jco-invalid.invalid");
  url.hostname = text;
  if (url.hostname === "jco-invalid.invalid") {
    // A hostname setter leaves its previous value intact on parse failure.
    // A second sentinel distinguishes a valid input equal to the first one.
    url.hostname = "jco-second.invalid";
    url.hostname = text;
    if (url.hostname === "jco-second.invalid") {
      return "";
    }
  }
  return url.hostname;
}
export function domainToUnicode(domain: string): string {
  if (arguments.length === 0) {
    throw missingArgs("domain");
  }
  return punycode.toUnicode(domainToASCII(domain));
}
