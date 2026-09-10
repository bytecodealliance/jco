import nodeTty from "node:tty";
import { describe, expect, test } from "vitest";
import { createTty } from "../../../../../../src/wasi/0.2.x/node/24.x.x/tty/core.js";
import { errorOf, fakeTerminal, nextTick } from "../helpers/tty.js";

function once<T>(
  emitter: { once(event: string, listener: (value: T) => void): unknown },
  event: string,
): Promise<T> {
  return new Promise((resolve) => emitter.once(event, resolve));
}

describe("tty.WriteStream", () => {
  test("rejects invalid descriptors exactly as Node does, before touching the provider", () => {
    const terminal = fakeTerminal();
    const tty = createTty(terminal.host);
    for (const fd of [-1, 1.5, "1", undefined]) {
      const actual = errorOf(() => new tty.WriteStream(fd as number));
      const expected = errorOf(() => new nodeTty.WriteStream(fd as number));
      expect(actual).toBeInstanceOf(RangeError);
      expect(actual.code).toBe(expected.code);
      expect(actual.message).toBe(expected.message);
    }
    expect(terminal.calls).toEqual([]);
  });

  test("fails to construct on a descriptor that is not a terminal", () => {
    const terminal = fakeTerminal({ terminals: [] });
    const tty = createTty(terminal.host);
    const error = errorOf(() => new tty.WriteStream(1));
    expect(error.code).toBe("ERR_TTY_INIT_FAILED");
    expect(error.name).toBe("SystemError");
    expect(terminal.calls).toEqual(["open(1, write)"]);
  });

  test("reports the terminal size when the provider has one", () => {
    const tty = createTty(fakeTerminal({ size: { columns: 132, rows: 43 } }).host);
    const output = new tty.WriteStream(1);
    expect(Object.keys(output)).toEqual(expect.arrayContaining(["columns", "rows"]));
    expect(output.columns).toBe(132);
    expect(output.rows).toBe(43);
    expect(output.getWindowSize()).toEqual([132, 43]);
    expect(output.isTTY).toBe(true);
    expect(Object.hasOwn(output, "isTTY")).toBe(false);
    expect(output.writable).toBe(true);
    expect(output.readable).toBe(false);
  });

  test("leaves the size absent when the terminal reports none, as Node does", () => {
    const terminal = fakeTerminal({ size: null });
    const tty = createTty(terminal.host);
    const output = new tty.WriteStream(2);
    expect("columns" in output).toBe(false);
    expect("rows" in output).toBe(false);
    expect(output.getWindowSize()).toEqual([undefined, undefined]);
    expect(terminal.calls).toEqual(["open(2, write)", "windowSize(2)"]);
  });

  test("writes strings and bytes through the provider", async () => {
    const terminal = fakeTerminal();
    const tty = createTty(terminal.host);
    const output = new tty.WriteStream(1);
    const callbacks: unknown[] = [];
    expect(output.write("héllo ", (error) => callbacks.push(error))).toBe(true);
    output.write(new TextEncoder().encode("wörld"));
    output.write(new Uint16Array([0x2021]));
    await nextTick();
    expect(terminal.output).toBe("héllo wörld! ");
    expect(callbacks).toEqual([undefined]);
    expect(terminal.calls.filter((call) => call.startsWith("write"))).toEqual([
      "write(1, 7)",
      "write(1, 6)",
      "write(1, 2)",
    ]);
  });

  test("end() finishes and releases the handle", async () => {
    const terminal = fakeTerminal();
    const tty = createTty(terminal.host);
    const output = new tty.WriteStream(1);
    output.end("bye\n");
    await once(output, "close");
    expect(terminal.output).toBe("bye\n");
    expect(terminal.calls.at(-1)).toBe("close(1, write)");
    expect(terminal.handles.size).toBe(0);
  });

  test("a failing write errors the stream with the provider's error", async () => {
    const failure = {
      name: "Error",
      message: "write EPIPE: broken pipe",
      code: "EPIPE",
      syscall: "write",
    };
    const tty = createTty(fakeTerminal({ writeFailure: failure }).host);
    const output = new tty.WriteStream(1);
    const callbacks: unknown[] = [];
    output.write("x", (error) => callbacks.push(error));
    const error = await once<Error & { code?: string }>(output, "error");
    expect(error.code).toBe("EPIPE");
    expect(error.message).toBe(failure.message);
    expect(callbacks).toEqual([error]);
  });

  test("_refreshSize() re-queries the provider and emits 'resize' on change", () => {
    let size = { columns: 80, rows: 24 };
    const terminal = fakeTerminal({ size: () => size });
    const tty = createTty(terminal.host);
    const output = new tty.WriteStream(1);
    const events: string[] = [];
    output.on("resize", () => events.push("resize"));
    output._refreshSize();
    expect(events).toEqual([]);
    size = { columns: 100, rows: 24 };
    output._refreshSize();
    expect(events).toEqual(["resize"]);
    expect(output.getWindowSize()).toEqual([100, 24]);
    expect(terminal.calls.filter((call) => call.startsWith("windowSize"))).toHaveLength(3);
  });

  test("_refreshSize() emits the provider's error when the size is unavailable", () => {
    let available = true;
    const tty = createTty(
      fakeTerminal({
        size: () => {
          if (!available) {
            throw {
              name: "Error",
              message: "getWindowSize EBADF: bad file descriptor",
              code: "EBADF",
              syscall: "getWindowSize",
            };
          }
          return { columns: 1, rows: 1 };
        },
      }).host,
    );
    const output = new tty.WriteStream(1);
    const errors: Array<Error & { code?: string; syscall?: string }> = [];
    output.on("error", (error) => errors.push(error as Error & { code?: string }));
    available = false;
    output._refreshSize();
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("EBADF");
    expect(errors[0].syscall).toBe("getWindowSize");
    expect(output.getWindowSize()).toEqual([1, 1]);
  });

  test("cursor helpers write the same sequences as Node and call back", async () => {
    const terminal = fakeTerminal();
    const tty = createTty(terminal.host);
    const output = new tty.WriteStream(1);
    const expected: string[] = [];
    const oracle = { write: (data: string) => expected.push(data) > 0 };
    const callbacks: unknown[] = [];
    const callback = (error?: Error | null): void => {
      callbacks.push(error);
    };
    const results = [
      output.cursorTo(2),
      output.cursorTo(1, 3),
      output.moveCursor(-2, 3),
      output.clearLine(-1),
      output.clearLine(1),
      output.clearLine(0),
      output.clearScreenDown(),
      output.cursorTo(4, callback),
      output.moveCursor(0, 0, callback),
      output.clearLine(0, callback),
      output.clearScreenDown(callback),
    ];
    const proto = nodeTty.WriteStream.prototype;
    proto.cursorTo.call(oracle, 2);
    proto.cursorTo.call(oracle, 1, 3);
    proto.moveCursor.call(oracle, -2, 3);
    proto.clearLine.call(oracle, -1);
    proto.clearLine.call(oracle, 1);
    proto.clearLine.call(oracle, 0);
    proto.clearScreenDown.call(oracle);
    proto.cursorTo.call(oracle, 4);
    proto.moveCursor.call(oracle, 0, 0);
    proto.clearLine.call(oracle, 0);
    proto.clearScreenDown.call(oracle);
    await nextTick();
    expect(terminal.output).toBe(expected.join(""));
    expect(results.every((result) => result === true)).toBe(true);
    // Each callback fires once without an error, whether the sequence was written or skipped.
    expect(callbacks).toHaveLength(4);
    expect(callbacks.every((error) => error == null)).toBe(true);
  });
});
