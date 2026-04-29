import process from "node:process";
import { Readable } from "node:stream";

import { ResourceWorker } from "./workers/resource-worker.js";
import { StreamReader, readableStreamFromIterator } from "./stream.js";
import { future } from "./future.js";

import { environment as environmentV2 } from "@bytecodealliance/preview2-shim/cli";

export {
  _appendEnv,
  _setEnv,
  _setArgs,
  _setCwd,
  _setTerminalStdin,
  _setTerminalStdout,
  _setTerminalStderr,
  exit,
  terminalInput,
  terminalOutput,
  terminalStdin,
  terminalStdout,
  terminalStderr,
} from "@bytecodealliance/preview2-shim/cli";

// `wasi:cli/environment` renamed `initial-cwd` to `get-initial-cwd` between
// p2 and p3. Adapt the p2-shim shape to the p3 WIT member name while
// re-exporting the unchanged members.
export const environment = {
  getEnvironment: environmentV2.getEnvironment,
  getArguments: environmentV2.getArguments,
  getInitialCwd: environmentV2.initialCwd,
};

let WORKER = null;
function worker() {
  return (WORKER ??= new ResourceWorker(new URL("./workers/cli-worker.js", import.meta.url)));
}

/**
 * Map a Node.js error to a WIT error-code enum value.
 * WIT: enum error-code { io, illegal-byte-sequence, pipe }
 * @param {Error} err
 * @returns {string}
 */
function errorCode(err) {
  if (err?.code === "EPIPE" || err?.code === "ERR_STREAM_PREMATURE_CLOSE") {
    return "pipe";
  }
  if (err?.code === "ERR_ENCODING_INVALID_ENCODED_DATA") {
    return "illegal-byte-sequence";
  }
  return "io";
}

export const stdin = {
  /**
   * Return a stream for reading from stdin, and a future to signal read results.
   *
   * WIT:
   * ```
   * read-via-stream: func() -> tuple<stream<u8>, future<result<_, error-code>>>;
   * ```
   *
   * @returns {[StreamReader, FutureReader]} A tuple of [stream, future].
   */
  readViaStream() {
    const readable = Readable.toWeb(process.stdin);
    const { tx: futureTx, rx: futureRx } = future();

    const reader = new StreamReader(readable);
    const originalRead = reader.read.bind(reader);
    reader.read = async () => {
      try {
        const chunk = await originalRead();
        if (chunk === null) {
          await futureTx.write({ tag: "ok", val: undefined });
        }
        return chunk;
      } catch (err) {
        await futureTx.write({ tag: "err", val: errorCode(err) });
        throw err;
      }
    };

    return [reader, futureRx];
  },
};

export const stdout = {
  /**
   * Write the given stream to stdout.
   *
   * WIT:
   * ```
   * write-via-stream: func(data: stream<u8>) -> future<result<_, error-code>>;
   * ```
   * @returns {Promise<{tag: string, val?: string}>} Result of the write operation.
   */
  async writeViaStream(streamReader) {
    const readableStream = readableStreamFromIterator(streamReader[Symbol.asyncIterator]());
    try {
      await worker().run({ op: "stdout", stream: readableStream }, [readableStream]);
      return { tag: "ok", val: undefined };
    } catch (err) {
      return { tag: "err", val: errorCode(err) };
    }
  },
};

export const stderr = {
  /**
   * Write the given stream to stderr.
   *
   * WIT:
   * ```
   * write-via-stream: func(data: stream<u8>) -> future<result<_, error-code>>;
   * ```
   * @returns {Promise<{tag: string, val?: string}>} Result of the write operation.
   */
  async writeViaStream(streamReader) {
    const readableStream = readableStreamFromIterator(streamReader[Symbol.asyncIterator]());
    try {
      await worker().run({ op: "stderr", stream: readableStream }, [readableStream]);
      return { tag: "ok", val: undefined };
    } catch (err) {
      return { tag: "err", val: errorCode(err) };
    }
  },
};
