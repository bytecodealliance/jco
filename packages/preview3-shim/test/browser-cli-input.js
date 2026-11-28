import { expect, test, vi } from "vitest";

import { stdin as preview2Stdin } from "@bytecodealliance/preview2-shim/cli";
import stdin from "../dist/browser/cli/stdin.js";

vi.mock("@bytecodealliance/preview2-shim/cli", () => ({ stdin: { getStdin: vi.fn() } }));

test("stdin waits for another read after delivering the last byte of a line", async () => {
  const lines = ["hello\n", "world\n"].map((line) => new TextEncoder().encode(line));
  const blockingRead = vi.fn(() => {
    throw { tag: "closed" };
  });
  for (const line of lines) {
    blockingRead.mockReturnValueOnce(line);
  }
  preview2Stdin.getStdin.mockReturnValue({ blockingRead });

  const [stream, completed] = stdin.readViaStream();
  const reader = stream.getReader();
  for (const [index, line] of lines.entries()) {
    for (const byte of line) {
      expect(await reader.read()).toEqual({ value: byte, done: false });
      expect(blockingRead).toHaveBeenCalledTimes(index + 1);
    }
  }

  expect(await reader.read()).toEqual({ value: undefined, done: true });
  expect(await completed).toEqual({ tag: "ok", val: undefined });
});
