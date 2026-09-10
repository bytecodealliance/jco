import nodeTty from "node:tty";
import { expect, test } from "vitest";
import { createTty } from "../../../../../../src/wasi/0.2.x/node/24.x.x/tty/core.js";
import { errorOf, fakeTerminal } from "../helpers/tty.js";
import { describeDifferential } from "../helpers/assert.js";

const oracle = nodeTty.WriteStream.prototype.hasColors;
const truecolor = { COLORTERM: "truecolor" };
const dumb = { TERM: "dumb" };

describeDifferential("tty.WriteStream#hasColors()", () => {
  test.skipIf(process.platform === "win32")("accepts every documented call shape like Node", () => {
    const tty = createTty(fakeTerminal().host);
    const subject = tty.WriteStream.prototype.hasColors;
    const cases: unknown[][] = [
      [16, truecolor],
      [256, truecolor],
      [2 ** 24, truecolor],
      [2 ** 24 + 1, truecolor],
      [2, dumb],
      [3, dumb],
      [16, { TERM: "xterm" }],
      [256, { TERM: "xterm" }],
      [truecolor],
      [dumb],
      [{ TERM: "xterm-256color" }],
    ];
    for (const args of cases) {
      expect(Reflect.apply(subject, undefined, args), JSON.stringify(args)).toBe(
        Reflect.apply(oracle, undefined, args),
      );
    }
  });

  test("validates the count exactly as Node does", () => {
    const tty = createTty(fakeTerminal().host);
    const subject = tty.WriteStream.prototype.hasColors;
    // 2 ** 53 is left out: Node prints the received value with numeric separators, which the
    // shared ERR_OUT_OF_RANGE helper does not reproduce.
    for (const count of [1, 0, -1, 1.5, "16", null, Number.NaN]) {
      const actual = errorOf(() => Reflect.apply(subject, undefined, [count, truecolor]));
      const expected = errorOf(() => Reflect.apply(oracle, undefined, [count, truecolor]));
      expect(actual.code, String(count)).toBe(expected.code);
      expect(actual.message, String(count)).toBe(expected.message);
      expect(actual.constructor).toBe(expected.constructor);
    }
  });
});

test("hasColors() defaults to 16 colors against the provider's environment", () => {
  const terminal = fakeTerminal({ environment: { TERM: "xterm" } });
  const tty = createTty(terminal.host);
  const output = new tty.WriteStream(1);
  expect(output.hasColors()).toBe(true);
  expect(output.hasColors(256)).toBe(false);
  expect(output.hasColors({ COLORTERM: "truecolor" })).toBe(true);
  expect(output.hasColors(2 ** 24)).toBe(false);
  expect(terminal.calls.filter((call) => call === "environment()")).toHaveLength(3);
});
