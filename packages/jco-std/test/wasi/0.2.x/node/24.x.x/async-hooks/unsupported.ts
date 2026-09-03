import { describe, expect, test } from "vitest";

import * as asyncHooks from "../../../../../../src/wasi/0.2.x/node/24.x.x/async-hooks.js";
import { AsyncLocalStorage } from "../../../../../../src/wasi/0.2.x/node/24.x.x/async-hooks/async-local-storage.js";
import { AsyncResource } from "../../../../../../src/wasi/0.2.x/node/24.x.x/async-hooks/async-resource.js";

const UNSUPPORTED = expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_NODE_API" });

/**
 * The async boundary is refused at the call site rather than yielding an empty store later.
 *
 * That is the whole reason this module is written by hand instead of reusing unenv's, which returns
 * `undefined` after an await and leaves the caller to discover it somewhere else.
 */
describe("asynchronous use is refused, not silently wrong", () => {
  test.concurrent("run rejects a callback that returns a promise", () => {
    const als = new AsyncLocalStorage();
    expect(() => als.run({ v: 1 }, () => Promise.resolve())).toThrow(UNSUPPORTED);
    expect(() => als.run({ v: 1 }, async () => undefined)).toThrowError(/await/);
  });

  test.concurrent("exit and withScope reject the same way", () => {
    const als = new AsyncLocalStorage();
    expect(() => als.exit(async () => undefined)).toThrow(UNSUPPORTED);
    expect(() => als.withScope(async () => undefined)).toThrow(UNSUPPORTED);
  });

  test.concurrent("a snapshot callback returning a promise is refused", () => {
    const run = AsyncLocalStorage.snapshot();
    expect(() => run(async () => undefined)).toThrow(UNSUPPORTED);
  });

  test.concurrent("the error explains why rather than just refusing", () => {
    const als = new AsyncLocalStorage();
    try {
      als.run({ v: 1 }, async () => undefined);
      expect.unreachable("expected a refusal");
    } catch (error) {
      expect(String(error)).toMatch(/PerformPromiseThen/);
      expect(String(error)).toMatch(/AsyncContext/);
    }
  });

  test.concurrent("the synchronous scope is still restored after a refusal", () => {
    const als = new AsyncLocalStorage();
    expect(() => als.run({ v: 1 }, async () => undefined)).toThrow();
    expect(als.getStore()).toBeUndefined();
  });
});

describe("APIs describing the async resource graph", () => {
  test.each(["createHook", "executionAsyncId", "triggerAsyncId", "executionAsyncResource"])(
    "%s throws an explicit unsupported error",
    (name) => {
      const fn = (asyncHooks as unknown as Record<string, () => unknown>)[name];
      expect(fn).toThrow(UNSUPPORTED);
    },
  );

  test.concurrent("emitDestroy throws rather than silently doing nothing", () => {
    expect(() => new AsyncResource("thing").emitDestroy()).toThrow(UNSUPPORTED);
  });

  test.concurrent("asyncWrapProviders is an empty frozen table", () => {
    expect(Object.isFrozen(asyncHooks.asyncWrapProviders)).toBe(true);
    expect(Object.keys(asyncHooks.asyncWrapProviders)).toEqual([]);
  });
});
