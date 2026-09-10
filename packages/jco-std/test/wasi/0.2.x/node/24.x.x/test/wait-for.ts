import { expect, test } from "vitest";
import { harness } from "../helpers/test.js";
test("waitFor retries thrown/rejected conditions and resolves even falsy values", async () => {
  const h = harness();
  await h.test("waitFor", async (t): Promise<void> => {
    let count = 0;
    expect(
      await t.waitFor(
        (): number => {
          if (++count < 3) {
            throw new Error("retry");
          }
          return 0;
        },
        { interval: 1, timeout: 100 },
      ),
    ).toBe(0);
    expect(count).toBe(3);
    await expect(
      t.waitFor(
        (): never => {
          throw new Error("cause");
        },
        { interval: 1, timeout: 5 },
      ),
    ).rejects.toMatchObject({ message: "waitFor() timed out", cause: new Error("cause") });
    expect(() => t.waitFor((): void => {}, { interval: -1 })).toThrow(/options.interval/);
  });
  await h.drain();
  expect(h.results()[0].details.error).toBeUndefined();
});
