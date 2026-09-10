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

/** Adapted from nodejs/node v24.20.0, 71b8b174857e25106d39b61a9e6f30d927da8b01,
 * lib/tls.js. Uses public Buffer APIs and an explicit RangeError code. */
import { Buffer } from "node:buffer";

export function convertALPNProtocols(
  protocols: unknown,
  out: { ALPNProtocols?: Uint8Array },
): void {
  if (Array.isArray(protocols)) {
    const lengths: number[] = [];
    const buffer = Buffer.allocUnsafe(
      protocols.reduce((total: number, protocol: string, index: number) => {
        const length = Buffer.byteLength(protocol);
        if (length > 255) {
          throw Object.assign(
            new RangeError(
              `The byte length of the protocol at index ${index} exceeds the maximum length. It must be <= 255. Received ${length}`,
            ),
            { code: "ERR_OUT_OF_RANGE" },
          );
        }
        lengths[index] = length;
        return total + 1 + length;
      }, 0),
    );
    let offset = 0;
    for (let index = 0; index < protocols.length; index++) {
      buffer[offset++] = lengths[index];
      buffer.write(protocols[index], offset);
      offset += lengths[index];
    }
    out.ALPNProtocols = buffer;
  } else if (ArrayBuffer.isView(protocols)) {
    out.ALPNProtocols = Buffer.from(
      new Uint8Array(protocols.buffer, protocols.byteOffset, protocols.byteLength),
    );
  }
}
