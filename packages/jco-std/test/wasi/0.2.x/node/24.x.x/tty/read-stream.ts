import nodeTty from "node:tty";
import { describe, expect, test } from "vitest";
import { createTty } from "../../../../../../src/wasi/0.2.x/node/24.x.x/tty/core.js";
import { NOT_A_TERMINAL, errorOf, fakeTerminal, nextTick } from "../helpers/tty.js";

function once<T>(
  emitter: { once(event: string, listener: (value: T) => void): unknown },
  event: string,
): Promise<T> {
  return new Promise((resolve) => emitter.once(event, resolve));
}

describe("tty.ReadStream", () => {
  test("rejects invalid descriptors exactly as Node does, before touching the provider", () => {
    const terminal = fakeTerminal();
    const tty = createTty(terminal.host);
    for (const fd of [-1, 1.5, "1", undefined, null, 2 ** 31]) {
      const actual = errorOf(() => new tty.ReadStream(fd as number));
      const expected = errorOf(() => new nodeTty.ReadStream(fd as number));
      expect(actual.code).toBe("ERR_INVALID_FD");
      expect(actual).toBeInstanceOf(RangeError);
      expect(actual.message).toBe(expected.message);
      expect(actual.code).toBe(expected.code);
    }
    expect(terminal.calls).toEqual([]);
  });

  test("fails to construct on a descriptor that is not a terminal", () => {
    const terminal = fakeTerminal({ terminals: [0] });
    const tty = createTty(terminal.host);
    const error = errorOf(() => new tty.ReadStream(7));
    expect(error.name).toBe("SystemError");
    expect(error.code).toBe("ERR_TTY_INIT_FAILED");
    expect(error.message).toBe(NOT_A_TERMINAL.message);
    expect(error.errno).toBe(-22);
    expect(error.syscall).toBe("uv_tty_init");
    expect(error.info).toEqual({
      errno: -22,
      code: "EINVAL",
      message: "invalid argument",
      syscall: "uv_tty_init",
    });
    expect(terminal.calls).toEqual(["open(7, read)"]);
    expect(terminal.handles.size).toBe(0);
  });

  test("starts cooked, readable and not writable", () => {
    const tty = createTty(fakeTerminal().host);
    const input = new tty.ReadStream(0);
    expect(Object.keys(input)).toEqual(expect.arrayContaining(["isRaw", "isTTY"]));
    expect(input.isRaw).toBe(false);
    expect(input.isTTY).toBe(true);
    expect(input.readable).toBe(true);
    expect(input.writable).toBe(false);
    expect(Object.hasOwn(input, "setRawMode")).toBe(false);
  });

  test("setRawMode() switches the terminal through the provider and coerces its argument", () => {
    const terminal = fakeTerminal();
    const tty = createTty(terminal.host);
    const input = new tty.ReadStream(0);
    expect(input.setRawMode(true)).toBe(input);
    expect(input.isRaw).toBe(true);
    expect(terminal.raw.get(0)).toBe(true);
    input.setRawMode("" as unknown as boolean);
    expect(input.isRaw).toBe(false);
    input.setRawMode(1 as unknown as boolean);
    expect(input.isRaw).toBe(true);
    expect(terminal.calls.slice(1)).toEqual([
      "setRawMode(0, true)",
      "setRawMode(0, false)",
      "setRawMode(0, true)",
    ]);
  });

  test("setRawMode() failures are emitted as 'error' and leave isRaw alone", () => {
    const failure = {
      name: "Error",
      message: "setRawMode ENOTTY: inappropriate ioctl for device",
      code: "ENOTTY",
      errno: { tag: "number" as const, val: -25n },
      syscall: "setRawMode",
    };
    const tty = createTty(fakeTerminal({ rawModeFailure: failure }).host);
    const input = new tty.ReadStream(0);
    const errors: unknown[] = [];
    input.on("error", (error) => errors.push(error));
    expect(input.setRawMode(true)).toBe(input);
    expect(input.isRaw).toBe(false);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      message: failure.message,
      code: "ENOTTY",
      errno: -25,
      syscall: "setRawMode",
    });
  });

  test("flows by pulling one chunk per read until the terminal ends", async () => {
    const terminal = fakeTerminal({ input: ["ab", "cd", new Uint8Array([0x65])] });
    const tty = createTty(terminal.host);
    const input = new tty.ReadStream(0);
    const chunks: string[] = [];
    const closed = once(input, "close");
    input.on("data", (chunk) => chunks.push(String(chunk)));
    expect(terminal.calls.filter((call) => call.startsWith("read"))).toEqual([]);
    await once(input, "end");
    expect(chunks).toEqual(["ab", "cd", "e"]);
    expect(terminal.calls.filter((call) => call.startsWith("read"))).toEqual(
      Array(4).fill("read(0, 65536)"),
    );
    await closed;
    expect(terminal.calls.at(-1)).toBe("close(0, read)");
    expect(terminal.handles.size).toBe(0);
  });

  test("pause() stops pulling after the current chunk", async () => {
    const terminal = fakeTerminal({ input: ["one", "two", "three"] });
    const tty = createTty(terminal.host);
    const input = new tty.ReadStream(0);
    const chunks: string[] = [];
    input.on("data", (chunk) => {
      chunks.push(String(chunk));
      if (chunks.length < 3) {
        input.pause();
      }
    });
    await nextTick();
    expect(chunks).toEqual(["one"]);
    expect(terminal.calls.filter((call) => call.startsWith("read"))).toHaveLength(1);
    input.resume();
    await nextTick();
    expect(chunks).toEqual(["one", "two"]);
    expect(terminal.calls.filter((call) => call.startsWith("read"))).toHaveLength(2);
    const ended = once(input, "end");
    input.resume();
    await ended;
    expect(chunks).toEqual(["one", "two", "three"]);
    expect(terminal.calls.filter((call) => call.startsWith("read"))).toHaveLength(4);
  });

  test("honours stream options such as an encoding", async () => {
    const tty = createTty(fakeTerminal({ input: ["héllo"] }).host);
    const input = new tty.ReadStream(0, { encoding: "utf8" });
    const chunks: unknown[] = [];
    input.on("data", (chunk) => chunks.push(chunk));
    await once(input, "end");
    expect(chunks).toEqual(["héllo"]);
  });

  test("a failing read destroys the stream with the provider's error", async () => {
    const failure = { name: "Error", message: "read EIO: i/o error", code: "EIO", syscall: "read" };
    const terminal = fakeTerminal({ readFailure: failure });
    const tty = createTty(terminal.host);
    const input = new tty.ReadStream(0);
    const closed = once(input, "close");
    input.resume();
    const error = await once<Error & { code?: string }>(input, "error");
    expect(error.message).toBe(failure.message);
    expect(error.code).toBe("EIO");
    await closed;
    expect(input.destroyed).toBe(true);
    expect(terminal.handles.size).toBe(0);
  });

  test("destroy() releases the terminal handle", async () => {
    const terminal = fakeTerminal();
    const tty = createTty(terminal.host);
    const first = new tty.ReadStream(0);
    const second = new tty.ReadStream(0);
    expect(terminal.handles.get("read:0")).toBe(2);
    first.destroy();
    await once(first, "close");
    expect(terminal.handles.get("read:0")).toBe(1);
    second.destroy();
    await once(second, "close");
    expect(terminal.handles.size).toBe(0);
  });
});
