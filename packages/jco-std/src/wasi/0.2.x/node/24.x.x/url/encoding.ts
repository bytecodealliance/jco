/**
 * Adapter for whatwg-url@14.2.0/lib/encoding.js (jsdom, MIT).
 * Jco substitutes this precise internal module when bundling so QuickJS need
 * not provide TextEncoder/TextDecoder. Encoding uses the shared Buffer core;
 * decoding follows the UTF-8 state machine, including maximal-subpart errors.
 */
import { Buffer } from "node:buffer";

export function utf8Encode(value: string): Uint8Array {
  return Buffer.from(value, "utf8");
}
/**
 * Adapted from holepunchto/text-decoder@1.2.7 lib/utf8-decoder.js, Apache-2.0.
 * Copyright Holepunch. License: licenses/text-decoder-LICENSE in this package.
 * The streaming state machine is made local to a single complete input. Its
 * b4a fast path is removed because Feross Buffer differs on malformed UTF-8.
 */
export function utf8DecodeWithoutBOM(bytes: Uint8Array): string {
  let result = "";
  let codePoint = 0;
  let bytesNeeded = 0;
  let bytesSeen = 0;
  let lowerBoundary = 0x80;
  let upperBoundary = 0xbf;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (bytesNeeded === 0) {
      if (byte <= 0x7f) {
        result += String.fromCharCode(byte);
      } else if (byte >= 0xc2 && byte <= 0xdf) {
        bytesNeeded = 2;
        bytesSeen = 1;
        codePoint = byte & 0x1f;
      } else if (byte >= 0xe0 && byte <= 0xef) {
        if (byte === 0xe0) {
          lowerBoundary = 0xa0;
        } else if (byte === 0xed) {
          upperBoundary = 0x9f;
        }
        bytesNeeded = 3;
        bytesSeen = 1;
        codePoint = byte & 0xf;
      } else if (byte >= 0xf0 && byte <= 0xf4) {
        if (byte === 0xf0) {
          lowerBoundary = 0x90;
        } else if (byte === 0xf4) {
          upperBoundary = 0x8f;
        }
        bytesNeeded = 4;
        bytesSeen = 1;
        codePoint = byte & 0x7;
      } else {
        result += "\ufffd";
      }
      continue;
    }
    if (byte < lowerBoundary || byte > upperBoundary) {
      result += "\ufffd";
      i--;
      codePoint = bytesNeeded = bytesSeen = 0;
      lowerBoundary = 0x80;
      upperBoundary = 0xbf;
      continue;
    }
    lowerBoundary = 0x80;
    upperBoundary = 0xbf;
    codePoint = (codePoint << 6) | (byte & 0x3f);
    bytesSeen++;
    if (bytesSeen === bytesNeeded) {
      result += String.fromCodePoint(codePoint);
      codePoint = bytesNeeded = bytesSeen = 0;
    }
  }
  return bytesNeeded > 0 ? result + "\ufffd" : result;
}
