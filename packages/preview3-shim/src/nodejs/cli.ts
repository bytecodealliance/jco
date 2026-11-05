import process from "node:process";
import { Readable, type Writable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { StreamReader, readableByteStreamFromReader } from "./stream.js";
import { future } from "./future.js";

import * as cliV2 from "@bytecodealliance/preview2-shim/cli";

type Preview2NodeCli = typeof cliV2 & {
  _appendEnv: (env: Record<string, string>) => void;
  _setTerminalStdin: (terminalStdin: unknown) => void;
  _setTerminalStdout: (terminalStdout: unknown) => void;
  _setTerminalStderr: (terminalStderr: unknown) => void;
};

const nodeCliV2 = cliV2 as Preview2NodeCli;

export const {
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
} = nodeCliV2;

// `wasi:cli/environment` renamed `initial-cwd` to `get-initial-cwd` between
// p2 and p3. Adapt the p2-shim shape to the p3 WIT member name while
// re-exporting the unchanged members.
export const environment = {
  getEnvironment: cliV2.environment.getEnvironment,
  getArguments: cliV2.environment.getArguments,
  getInitialCwd: cliV2.environment.initialCwd,
};

type OutputWrite = { close: () => void; finished: Promise<unknown> };

function flush(writable: Writable) {
  return new Promise<void>((resolve, reject) => {
    writable.write(new Uint8Array(0), (err) => (err ? reject(err) : resolve()));
  });
}

function output(name: "stdout" | "stderr") {
  const writes = new Set<OutputWrite>();
  return {
    /** Write a stream and report completion or an I/O error. */
    async writeViaStream(streamReader) {
      return writeViaStream(streamReader, process[name], `${name} stream`, writes);
    },
    /** Wait for writes queued on the Node destination without closing the reader. */
    _flush() {
      return flush(process[name]);
    },
    /** Close active host readers and drain output after the producer has stopped. */
    async _shutdown() {
      const pending = [...writes];
      for (const write of pending) {
        write.close();
      }
      await Promise.all(pending.map((write) => write.finished));
      await flush(process[name]);
    },
  };
}

/** Wait for writes currently queued on both Node output destinations. */
export async function _flush() {
  await Promise.all([stdout._flush(), stderr._flush()]);
}

/** Shut down both output readers and drain their accepted writes. */
export async function _shutdown() {
  await Promise.all([stdout._shutdown(), stderr._shutdown()]);
}

function writeViaStream(streamReader, writable: Writable, name: string, writes: Set<OutputWrite>) {
  let ended = false;
  const readable = readableByteStreamFromReader(streamReader, { name });
  async function* chunks() {
    for await (const chunk of readable) {
      yield chunk;
    }
    ended = true;
  }
  const write = {
    close() {
      if (!ended) {
        ended = true;
        streamReader[Symbol.dispose]?.();
      }
    },
    finished: null as Promise<unknown>,
  };
  writes.add(write);
  write.finished = pipeline(Readable.from(chunks(), { objectMode: false }), writable, {
    end: false,
  })
    .then(() => ({ tag: "ok", val: undefined }))
    .catch((err) => ({ tag: "err", val: errorCode(err) }))
    .finally(() => writes.delete(write));
  return write.finished;
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

    async function* stdinChunks() {
      try {
        for await (const chunk of readable.values({ preventCancel: true })) {
          yield chunk;
        }
        await futureTx.write({ tag: "ok", val: undefined });
      } catch (err) {
        await futureTx.write({ tag: "err", val: errorCode(err) });
        throw err;
      }
    }

    return [new StreamReader(stdinChunks()), futureRx];
  },
};

export const stdout = output("stdout");
export const stderr = output("stderr");
