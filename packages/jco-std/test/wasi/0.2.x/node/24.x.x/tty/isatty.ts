import nodeTty from "node:tty";
import { describe, expect, test } from "vitest";
import { createTty } from "../../../../../../src/wasi/0.2.x/node/24.x.x/tty/core.js";
import denyHost from "../../../../../../src/wasi/0.2.x/node/24.x.x/tty-host.js";
import { errorOf, fakeTerminal } from "../helpers/tty.js";

const outOfRange: unknown[] = [
  -1,
  "1",
  1.5,
  2147483648,
  null,
  undefined,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  {},
  [1],
  true,
  0n,
];

describe("tty.isatty()", () => {
  test("rejects everything Node rejects without consulting the provider", () => {
    const terminal = fakeTerminal({ terminals: [0, 1, 2, 2147483647] });
    const tty = createTty(terminal.host);
    for (const value of outOfRange) {
      expect(tty.isatty(value as number), String(value)).toBe(nodeTty.isatty(value as number));
    }
    expect(terminal.calls).toEqual([]);
  });

  test("asks the provider about every in-range descriptor", () => {
    const terminal = fakeTerminal({ terminals: [0, 2147483647] });
    const tty = createTty(terminal.host);
    expect(tty.isatty(0)).toBe(true);
    expect(tty.isatty(1)).toBe(false);
    expect(tty.isatty(2147483647)).toBe(true);
    expect(terminal.calls).toEqual(["isTty(0)", "isTty(1)", "isTty(2147483647)"]);
  });

  test("is denied by default", () => {
    const tty = createTty(denyHost);
    expect(tty.isatty(-1)).toBe(false);
    const error = errorOf(() => tty.isatty(1));
    expect(error.code).toBe("ERR_JCO_TTY_ADAPTER_REQUIRED");
    expect(error.message).toBe("node:tty requires an application-provided host adapter");
  });
});
