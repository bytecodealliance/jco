import type { InterfaceCore } from "./interface.js";

/** Event-backed iterator with Node's 1024-line water mark and close-on-return contract. */
export function lineIterator(rl: InterfaceCore): AsyncIterableIterator<string> {
  const lines: string[] = [];
  const pending: ((value: IteratorResult<string>) => void)[] = [];
  let finished = !!rl.closed;
  let paused = false;

  function onLine(line: string): void {
    if (pending.length) {
      pending.shift()!({ value: line, done: false });
    } else {
      lines.push(line);
      if (lines.length > 1024 && !paused) {
        paused = true;
        rl.pause();
      }
    }
  }

  function cleanup(): void {
    finished = true;
    rl.removeListener("line", onLine);
    rl.removeListener("close", cleanup);
    while (pending.length) {
      pending.shift()!({ value: undefined, done: true });
    }
  }

  if (!finished) {
    rl.on("line", onLine);
    rl.on("close", cleanup);
  }
  const iterator: AsyncIterableIterator<string> = {
    [Symbol.asyncIterator]() {
      return this;
    },

    next() {
      if (lines.length) {
        const value = lines.shift()!;
        if (paused && lines.length < 1 && !finished) {
          paused = false;
          rl.resume();
        }
        return Promise.resolve({ value, done: false });
      }
      if (finished) {
        return Promise.resolve({ value: undefined, done: true });
      }
      return new Promise((resolve) => pending.push(resolve));
    },

    return() {
      lines.length = 0;
      cleanup();
      rl.close();
      return Promise.resolve({ value: undefined, done: true });
    },

    throw(error: unknown) {
      lines.length = 0;
      cleanup();
      rl.close();
      return Promise.reject(error);
    },
  };
  return iterator;
}
