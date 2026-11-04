import process from "node:process";
import { Readable } from "node:stream";
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

const outputWrites = new Set<{ close: () => void; finished: Promise<unknown> }>();

// A synchronous WASI exit unwinds the component; the command host drains output
// before terminating the process with the requested status.
export class _Exit extends Error {
  constructor(public readonly code: number) {
    super("WASI exit");
  }
}

export const exit = {
  exit(status: { tag: string }) {
    throw new _Exit(status.tag === "err" ? 1 : 0);
  },
  exitWithCode(code: number) {
    throw new _Exit(code);
  },
};

export async function _flush() {
  const writes = [...outputWrites];
  for (const write of writes) {
    write.close();
  }
  await Promise.all(writes.map((write) => write.finished));
}

function writeViaStream(streamReader, writable, name: string) {
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
        streamReader[Symbol.dispose]?.();
      }
    },
    finished: null as Promise<unknown>,
  };
  outputWrites.add(write);
  write.finished = pipeline(Readable.from(chunks(), { objectMode: false }), writable, {
    end: false,
  })
    .then(async () => {
      // Wait for the destination's callbacks without ending shared stdout/stderr.
      await new Promise<void>((resolve, reject) => {
        writable.write(new Uint8Array(0), (err) => (err ? reject(err) : resolve()));
      });
      return { tag: "ok", val: undefined };
    })
    .catch((err) => ({ tag: "err", val: errorCode(err) }))
    .finally(() => outputWrites.delete(write));
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
    return writeViaStream(streamReader, process.stdout, "stdout stream");
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
    return writeViaStream(streamReader, process.stderr, "stderr stream");
  },
};
