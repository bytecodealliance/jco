import { expect } from "vitest";
import { util, test } from "../helpers/util.js";

test("callbackify delivers results asynchronously and wraps falsy rejections", async () => {
  for (const reason of [undefined, null, 0, ""]) {
    const result = await new Promise<unknown>((resolve) => {
      util.callbackify(async () => {
        throw reason;
      })((error) => resolve(error));
    });
    expect(result).toMatchObject({ code: "ERR_FALSY_VALUE_REJECTION", reason });
  }

  const fn = async (value: number) => value + 1;

  const wrapped = util.callbackify(fn);
  expect(wrapped.name).toBe("fnCallbackified");
  expect(wrapped.length).toBe(2);
  const events: string[] = [];
  await new Promise<void>((resolve, reject) => {
    wrapped(2, (error, value) => {
      if (error) {
        reject(error);
      }
      expect(value).toBe(3);
      events.push("callback");
      resolve();
    });
    events.push("sync");
  });
  expect(events).toEqual(["sync", "callback"]);
  expect(() => Reflect.apply(wrapped, undefined, [2, null])).toThrow(
    expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
  );
});
