// Differential cases require the pinned Node 24 major; portable fixtures run on every major.
import native from "node:readline";
import { Writable } from "node:stream";
import { test, expect } from "vitest";
import readline from "../../../../../../src/wasi/0.2.x/node/24.x.x/readline.js";

test
  .skipIf(!process.versions.node.startsWith("24."))
  .concurrent(
    "cursor and clearing escape sequences, callbacks and backpressure match Node",
    async () => {
      async function report(api: typeof readline | typeof native) {
        const writes: string[] = [];
        const stream = new Writable({
          highWaterMark: 1,
          write(chunk, _encoding, cb) {
            writes.push(String(chunk));
            cb();
          },
        });
        const callbacks: unknown[] = [];
        const callback = (error?: Error | null): void => {
          callbacks.push(error);
        };
        const results = [
          api.cursorTo(stream, 2),
          api.cursorTo(stream, 1, 3),
          api.moveCursor(stream, -2, 3),
          api.clearLine(stream, -1),
          api.clearLine(stream, 1),
          api.clearLine(stream, 0),
          api.clearScreenDown(stream),
          Reflect.apply(api.cursorTo, api, [stream, 4, callback]),
          Reflect.apply(api.moveCursor, api, [null, 0, 0, callback]),
          Reflect.apply(api.clearLine, api, [undefined, 0, callback]),
          Reflect.apply(api.clearScreenDown, api, [null, callback]),
        ];
        await new Promise((resolve) => setImmediate(resolve));
        return { writes, callbacks, results };
      }
      expect(await report(readline)).toEqual(await report(native));
    },
  );
test
  .skipIf(!process.versions.node.startsWith("24."))
  .concurrent("invalid cursor positions and callbacks preserve Node error shapes", () => {
    for (const [x, y] of [
      [NaN, undefined],
      [1, NaN],
      [undefined, 2],
    ]) {
      const capture = (api: typeof readline | typeof native) => {
        try {
          api.cursorTo(
            new Writable({
              write(_c, _e, cb) {
                cb();
              },
            }),
            x as number,
            y,
          );
          return null;
        } catch (e) {
          const err = e as Error & { code: string };
          return [err.name, err.code, err.message];
        }
      };
      expect(capture(readline)).toEqual(capture(native));
    }
  });
