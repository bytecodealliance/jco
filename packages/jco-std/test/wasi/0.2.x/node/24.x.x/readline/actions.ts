// Differential cases require the pinned Node 24 major; portable fixtures run on every major.
import { Readline as NativeReadline } from "node:readline/promises";
import { Writable } from "node:stream";
import { test, expect } from "vitest";
import { Readline } from "../../../../../../src/wasi/0.2.x/node/24.x.x/readline-promises.js";

test
  .skipIf(!process.versions.node.startsWith("24."))
  .concurrent("pending actions, commit, rollback and autoCommit match Node", async () => {
    async function report(
      Constructor: typeof Readline | typeof NativeReadline,
      autoCommit: boolean,
    ) {
      const writes: string[] = [];
      const stream = new Writable({
        write(chunk, _encoding, cb) {
          writes.push(String(chunk));
          cb();
        },
      });
      const rl = new Constructor(stream, { autoCommit });
      expect(rl.cursorTo(1, 2).moveCursor(-3, 4).clearLine(-1).clearScreenDown()).toBe(rl);
      const before = [...writes];
      await rl.commit();
      rl.cursorTo(2).rollback();
      await rl.commit();
      await new Promise((resolve) => setImmediate(resolve));
      return { before, writes };
    }

    for (const autoCommit of [false, true]) {
      expect(await report(Readline, autoCommit)).toEqual(await report(NativeReadline, autoCommit));
    }
  });

test.concurrent("validates streams and integer actions", () => {
  const rl = new Readline(
    new Writable({
      write(_c, _e, cb) {
        cb();
      },
    }),
  );
  expect(() => rl.cursorTo(1.2)).toThrow(expect.objectContaining({ code: "ERR_OUT_OF_RANGE" }));
  expect(() => rl.clearLine(2)).toThrow(expect.objectContaining({ code: "ERR_OUT_OF_RANGE" }));
  expect(() => new Readline(null!)).toThrow(
    expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
  );
});

test
  .skipIf(!process.versions.node.startsWith("24."))
  .concurrent(
    "commit preserves the write callback result and rejects synchronous write failures",
    async () => {
      async function report(Constructor: typeof Readline | typeof NativeReadline) {
        const stream = new Writable({
          write(_chunk, _encoding, callback) {
            callback(new Error("write failed"));
          },
        });
        stream.on("error", () => {});
        const result: unknown = await new Constructor(stream).clearLine(0).commit();
        return result instanceof Error ? result.message : result;
      }

      expect(await report(Readline)).toBe(await report(NativeReadline));
      const stream = new Writable();
      stream.write = () => {
        throw new Error("synchronous write failure");
      };
      await expect(new Readline(stream).commit()).rejects.toThrow("synchronous write failure");
    },
  );

test
  .skipIf(!process.versions.node.startsWith("24."))
  .concurrent("rejects destroyed, ended and non-writable streams", () => {
    for (const state of ["destroyed", "ended", "not-writable"] as const) {
      for (const Constructor of [Readline, NativeReadline]) {
        const stream = new Writable({
          write(_chunk, _encoding, callback) {
            callback();
          },
        });
        if (state === "destroyed") {
          stream.destroy();
        }
        if (state === "ended") {
          stream.end();
        }
        if (state === "not-writable") {
          Object.defineProperty(stream, "writable", { value: false });
        }
        expect(() => new Constructor(stream)).toThrow(
          expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
        );
      }
    }
  });
