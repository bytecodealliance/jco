import { expect, test } from "vitest";
import { v8, blocked, deniedError, runNode } from "../helpers/v8.js";

test("changes the native host V8 flags in an isolated process", async () => {
  expect(
    await runNode(`
    const before = v8.cachedDataVersionTag();
    v8.setFlagsFromString('--allow_natives_syntax');
    console.log(before !== v8.cachedDataVersionTag());
  `),
  ).toBe("true");

  expect(() => blocked.setFlagsFromString("")).toThrow(expect.objectContaining(deniedError));
  expect(() => Reflect.apply(v8.setFlagsFromString, null, [42])).toThrow(
    expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
  );
});
