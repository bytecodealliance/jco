/** Native streams run in a worker so synchronous WIT calls can wait for Node's
 * public asynchronous stream API without blocking its libuv callbacks. */
import zlib from "node:zlib";
import { Buffer } from "node:buffer";
import { workerData } from "node:worker_threads";
import { serializeHostError } from "../internal/host-error.js";
import { nativeOptions } from "./host-utils.js";
import type { Command, Reply, WorkerData } from "./worker-types.js";

const { port, signal, algorithm, options } = workerData as WorkerData;
const factories = {
  deflate: zlib.createDeflate,
  inflate: zlib.createInflate,
  gzip: zlib.createGzip,
  gunzip: zlib.createGunzip,
  deflateraw: zlib.createDeflateRaw,
  inflateraw: zlib.createInflateRaw,
  unzip: zlib.createUnzip,
  brotlicompress: zlib.createBrotliCompress,
  brotlidecompress: zlib.createBrotliDecompress,
  zstdcompress: zlib.createZstdCompress,
  zstddecompress: zlib.createZstdDecompress,
};
function reply(value: Reply): void {
  port.postMessage(value);
  Atomics.store(signal, 0, 1);
  Atomics.notify(signal, 0);
}
try {
  const stream = factories[algorithm](nativeOptions(options));
  let chunks: Uint8Array[] = [];
  let failure: Error | undefined;
  let rejectPending: ((error: Error) => void) | undefined;
  stream.on("data", (chunk: Uint8Array): void => {
    chunks.push(chunk);
  });
  stream.on("error", (error: Error): void => {
    failure = error;
    rejectPending?.(error);
  });
  reply({ ok: true, output: { data: new Uint8Array(), bytesWritten: 0 } });
  port.on("message", async (command: Command): Promise<void> => {
    try {
      if (failure) {
        throw failure;
      }
      await new Promise<void>((resolve, reject): void => {
        rejectPending = reject;
        const done = (error?: Error | null): void => (error ? reject(error) : resolve());
        switch (command.op) {
          case "write":
            stream.write(command.data, done);
            break;
          case "finish":
            if (stream.readableEnded) {
              resolve();
              break;
            }
            stream.once("end", resolve);
            stream.end();
            break;
          case "flush":
            stream.flush(command.kind, done);
            break;
          case "reset":
            Reflect.apply(Reflect.get(stream, "reset"), stream, []);
            resolve();
            break;
          case "params":
            if (!("params" in stream)) {
              throw new TypeError("params is only supported by zlib streams");
            }
            stream.params(command.level, command.strategy, done);
            break;
        }
      });
      reply({
        ok: true,
        output: { data: Buffer.concat(chunks), bytesWritten: stream.bytesWritten },
      });
      chunks = [];
    } catch (error) {
      reply({ ok: false, error: serializeHostError(error) });
    } finally {
      rejectPending = undefined;
    }
  });
} catch (error) {
  reply({ ok: false, error: serializeHostError(error) });
}
