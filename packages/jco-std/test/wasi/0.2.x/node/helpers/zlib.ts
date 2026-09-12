import { Buffer } from "node:buffer";
import { createZlib } from "../../../../../src/wasi/0.2.x/node/24.x.x/zlib/core.js";
import host from "../../../../../dist/wasi/0.2.x/node/24.x.x/zlib-host-node.js";
import type {
  Zlib,
  ZlibBuffer,
  ZlibCallback,
} from "../../../../../src/wasi/0.2.x/node/24.x.x/zlib/types.js";

export const zlib = createZlib(host);

export function collect(stream: Zlib, chunks: Uint8Array[]): Promise<Buffer> {
  return new Promise((resolve, reject): void => {
    const output: Uint8Array[] = [];
    stream.on("data", (chunk: Uint8Array): void => {
      output.push(chunk);
    });
    stream.once("error", reject);
    stream.once("end", (): void => {
      resolve(Buffer.concat(output));
    });
    for (const chunk of chunks) {
      stream.write(chunk);
    }

    stream.end();
  });
}

export function callbackResult(
  run: (callback: ZlibCallback<ZlibBuffer>) => void,
): Promise<ZlibBuffer> {
  return new Promise((resolve, reject): void => {
    run((...args): void => {
      if (args[0]) {
        reject(args[0]);
      } else {
        resolve(args[1]);
      }
    });
  });
}
