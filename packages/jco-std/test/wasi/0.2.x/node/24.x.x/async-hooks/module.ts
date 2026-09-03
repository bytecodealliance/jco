import { describe, expect, test } from "vitest";

import * as asyncHooks from "../../../../../../src/wasi/0.2.x/node/24.x.x/async-hooks.js";
import nodeAsyncHooks from "node:async_hooks";

// Driven against the real module surface: what these compare is Node's own contract.
describe("node:async_hooks module contract", () => {
  test.concurrent("exposes Node's export surface", () => {
    for (const key of Object.keys(nodeAsyncHooks).filter((k) => k !== "default")) {
      expect(asyncHooks, key).toHaveProperty(key);
    }
  });

  test.concurrent("AsyncLocalStorage carries Node's prototype surface", () => {
    const ours = Object.getOwnPropertyNames(asyncHooks.AsyncLocalStorage.prototype);
    for (const member of ["run", "getStore", "exit", "enterWith", "disable", "withScope"]) {
      expect(ours, member).toContain(member);
    }
    expect(typeof asyncHooks.AsyncLocalStorage.snapshot).toBe("function");
    expect(typeof asyncHooks.AsyncLocalStorage.bind).toBe("function");
  });

  test.concurrent("AsyncResource carries Node's prototype surface", () => {
    const ours = Object.getOwnPropertyNames(asyncHooks.AsyncResource.prototype);
    for (const member of ["runInAsyncScope", "bind", "asyncId", "triggerAsyncId", "emitDestroy"]) {
      expect(ours, member).toContain(member);
    }
    expect(typeof asyncHooks.AsyncResource.bind).toBe("function");
  });
});
