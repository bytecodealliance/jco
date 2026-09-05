import type {
  WasiSocketsProvider,
  WasiTcpSocket,
} from "../../../../../../../src/wasi/0.2.x/node/24.x.x/internal/wasi-sockets.js";

/** Deterministic transport that obeys the WASI read limit and tracks resource ownership. */
export function createProvider(chunks: Uint8Array[] = []): {
  provider: WasiSocketsProvider;
  tasks: Array<() => void | Promise<void>>;
  disposed: string[];
  writes: Uint8Array[];
  readLengths: bigint[];
  failRead(error: unknown): void;
} {
  const tasks: Array<() => void | Promise<void>> = [];
  const disposed: string[] = [];
  const writes: Uint8Array[] = [];
  const readLengths: bigint[] = [];
  const queue = chunks.map((chunk) => chunk.slice());
  let readError: unknown;
  const socket: WasiTcpSocket = {
    startConnect: () => undefined,
    finishConnect: () => [
      {
        blockingRead(length) {
          readLengths.push(length);
          if (readError !== undefined) {
            throw readError;
          }
          const chunk = queue.shift();
          if (!chunk) {
            throw { tag: "closed" };
          }
          const count = Math.min(chunk.length, Number(length));
          if (count < chunk.length) {
            queue.unshift(chunk.subarray(count));
          }
          return chunk.subarray(0, count);
        },
        [Symbol.dispose]: () => {
          disposed.push("input");
        },
      },
      {
        blockingWriteAndFlush: (bytes) => {
          writes.push(Uint8Array.from(bytes));
        },
        [Symbol.dispose]: () => {
          disposed.push("output");
        },
      },
    ],
    subscribe: () => ({ block: () => undefined }),
    shutdown: () => undefined,
    [Symbol.dispose]: () => {
      disposed.push("socket");
    },
  };
  return {
    provider: {
      instanceNetwork: {
        instanceNetwork: () => ({
          [Symbol.dispose]: () => {
            disposed.push("network");
          },
        }),
      },
      ipNameLookup: {
        resolveAddresses: () => {
          throw new Error("Unexpected DNS lookup");
        },
      },
      tcpCreateSocket: { createTcpSocket: () => socket },
      schedule: (task) => {
        tasks.push(task);
      },
    },
    tasks,
    disposed,
    writes,
    readLengths,
    failRead: (error) => {
      readError = error;
    },
  };
}
