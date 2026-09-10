import { expect, test } from "vitest";
import { harness } from "../helpers/test.js";

test("sync, promise, thenable and callback tests settle with undefined", async () => {
  const h = harness();
  const calls: string[] = [];
  const pending = [
    h.test("sync", function (t): void {
      expect(this).toBe(t);
      calls.push(t.name);
    }),
    h.test("promise", async (t): Promise<void> => {
      await Promise.resolve();
      calls.push(t.name);
    }),
    h.test("callback", (t, done): void => {
      Promise.resolve().then((): void => {
        calls.push(t.name);
        done();
      });
    }),
  ];
  expect(await Promise.all(pending)).toEqual([undefined, undefined, undefined]);
  await h.drain();
  expect(calls).toEqual(["sync", "promise", "callback"]);
  expect(h.results().map((r) => r.details.error)).toEqual([undefined, undefined, undefined]);
});
test("failure resolves test promises and is visible during cleanup", async () => {
  const h = harness();
  const errors: unknown[] = [];
  await h.test("throws", (t): void => {
    t.after((): void => {
      errors.push([t.passed, t.error?.cause]);
    });
    throw new Error("boom");
  });
  await h.test("rejects", async (): Promise<void> => {
    throw "rejected";
  });
  await h.test("callback error", (_t, done): void => {
    done("callback error");
  });
  await h.test("both", (_t, done): Promise<void> => {
    done();
    return Promise.resolve();
  });
  await h.drain();
  expect(errors).toEqual([[false, new Error("boom")]]);
  expect(h.results().map((r) => r.details.error?.failureType)).toEqual([
    "testCodeFailure",
    "testCodeFailure",
    "testCodeFailure",
    "callbackAndPromisePresent",
  ]);
});
test("overloads, nested explicit contexts across await, and parent failures", async () => {
  const h = harness();
  await h.test(function named(): void {});
  await h.test({ tags: ["FAST", "fast"] }, function options(): void {});
  await h.test("parent", async (t): Promise<void> => {
    await Promise.resolve();
    await t.test("nested", (child): void => {
      expect(child.fullName).toBe("parent > nested");
      throw new Error("child");
    });
  });
  await h.drain();
  expect(h.results().map((r) => r.name)).toEqual(["named", "options", "nested", "parent"]);
  expect(h.results()[1].tags).toEqual(["fast"]);
  expect(h.results().at(-1)?.details.error?.failureType).toBe("subtestsFailed");
});
test("abort, timeout, invalid options and concurrent execution rejection", async () => {
  const h = harness();
  expect(() => h.test("bad", { timeout: -1 })).toThrow(/options.timeout/);
  expect(() => h.test("bad", { concurrency: 0 })).toThrow(/options.concurrency/);
  expect(() => h.test("bad", { concurrency: true })).toThrow(/concurrent tests/);
  expect(() => h.test("bad", { tags: [""] })).toThrow(/options.tags/);
  const controller = new AbortController();
  controller.abort("stop");
  await h.test("aborted", { signal: controller.signal }, (): never => {
    throw new Error("must not run");
  });
  await h.test("timeout", { timeout: 5 }, async (): Promise<void> => new Promise((): void => {}));
  await h.drain();
  expect(h.results().map((r) => r.details.error?.failureType)).toEqual([
    "testAborted",
    "testTimeoutFailure",
  ]);
});
test("timeout cancels nested tests and hooks once, before the parent reports", async () => {
  const h = harness();
  await h.test("parent", { timeout: 5 }, async (t): Promise<void> => {
    t.beforeEach(async (): Promise<void> => new Promise((): void => {}));
    await t.test("child", (): never => {
      throw new Error("must not run");
    });
  });
  await h.drain();
  expect(h.results().map((r) => r.name)).toEqual(["child", "parent"]);
  expect(h.results().every((r) => r.details.error)).toBe(true);
});
