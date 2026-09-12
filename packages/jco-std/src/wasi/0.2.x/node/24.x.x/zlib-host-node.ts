/** Opt-in passthrough to Node's native zlib, Brotli and Zstandard implementations.
 * No compression algorithm or Node private binding is implemented here. */
import zlib from "node:zlib";
import {
  Worker,
  MessageChannel,
  receiveMessageOnPort,
  type MessagePort,
} from "node:worker_threads";
import { nativeOptions, hostCall } from "./zlib/host-utils.js";
import type {
  Algorithm,
  HostOptions,
  Output,
  ZlibProvider,
  Engine as EngineType,
} from "./zlib/types.js";
import type { Command, Reply } from "./zlib/worker-types.js";

/** One worker owns one native stream. Closing/dropping the resource terminates it. */
export class Engine implements EngineType {
  #worker: Worker;
  #port: MessagePort;
  #signal = new Int32Array(new SharedArrayBuffer(4));
  #closed = false;

  constructor(algorithm: Algorithm, options: HostOptions) {
    const { port1, port2 } = new MessageChannel();
    this.#port = port1;
    this.#worker = new Worker(new URL("./zlib/host-worker.js", import.meta.url), {
      workerData: { port: port2, signal: this.#signal, algorithm, options },
      transferList: [port2],
      execArgv: [],
    });
    this.#worker.unref();
    this.#port.unref();
    // Handle asynchronous startup errors as well as the bounded synchronous wait below.
    this.#worker.on("error", (): void => {
      this.close();
    });
    try {
      this.#receive();
    } catch (error) {
      this.close();
      throw error;
    }
  }

  #receive(): Output {
    // A broken worker must not permanently strand a component in a synchronous import.
    if (Atomics.wait(this.#signal, 0, 0, 60_000) === "timed-out") {
      this.close();
      throw {
        name: "Error",
        message: "Node zlib worker did not respond within 60 seconds",
        code: "ERR_JCO_ZLIB_HOST_TIMEOUT",
      };
    }

    const packet = receiveMessageOnPort(this.#port);
    if (!packet) {
      throw {
        name: "Error",
        message: "Node zlib worker returned no reply",
        code: "ERR_JCO_ZLIB_HOST",
      };
    }

    const reply = packet.message as Reply; // Private worker protocol, not guest-controlled data.
    if (!reply.ok) {
      throw reply.error;
    }

    return reply.output;
  }

  #call(command: Command): Output {
    if (this.#closed) {
      throw { name: "Error", message: "zlib binding closed", code: "ERR_ASSERTION" };
    }

    Atomics.store(this.#signal, 0, 0);
    this.#port.postMessage(command);
    return this.#receive();
  }

  write(data: Uint8Array): Output {
    return this.#call({ op: "write", data });
  }

  finish(): Output {
    return this.#call({ op: "finish" });
  }

  flush(kind: number): Output {
    return this.#call({ op: "flush", kind });
  }

  params(level: number, strategy: number): Output {
    return this.#call({ op: "params", level, strategy });
  }

  reset(): void {
    this.#call({ op: "reset" });
  }

  close(): void {
    if (this.#closed) {
      return;
    }

    this.#closed = true;
    this.#port.close();
    void this.#worker.terminate();
  }

  [Symbol.dispose](): void {
    this.close();
  }
}

const methods = {
  deflate: zlib.deflateSync,
  inflate: zlib.inflateSync,
  gzip: zlib.gzipSync,
  gunzip: zlib.gunzipSync,
  deflateraw: zlib.deflateRawSync,
  inflateraw: zlib.inflateRawSync,
  unzip: zlib.unzipSync,
  brotlicompress: zlib.brotliCompressSync,
  brotlidecompress: zlib.brotliDecompressSync,
  zstdcompress: zlib.zstdCompressSync,
  zstddecompress: zlib.zstdDecompressSync,
};

export const open: ZlibProvider["open"] = (algorithm, options) =>
  hostCall(() => new Engine(algorithm, options));

export const compress: ZlibProvider["compress"] = (algorithm, data, options) =>
  hostCall(() => {
    // @types/node 24 omits the documented info:true result; Node returns this record.
    const result = methods[algorithm](data, {
      ...nativeOptions(options),
      info: true,
    }) as unknown as {
      buffer: Uint8Array;
      engine: { bytesWritten: number };
    };
    return { data: result.buffer, bytesWritten: result.engine.bytesWritten };
  });

export const crc32: ZlibProvider["crc32"] = (data, value) =>
  hostCall(() => zlib.crc32(data, value));

const host: ZlibProvider = { open, compress, crc32 };

export default host;
