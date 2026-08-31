import { describe, expect, test } from "vitest";

import { AsyncLocalStorage as NodeALS, AsyncResource as NodeAR } from "node:async_hooks";

import { AsyncLocalStorage } from "../../../../../../src/wasi/0.2.x/node/24.x.x/async-hooks/async-local-storage.js";
import { AsyncResource } from "../../../../../../src/wasi/0.2.x/node/24.x.x/async-hooks/async-resource.js";

/**
 * Scope capture is compared against Node rather than asserted from memory: Node binds a resource to
 * the context it was *constructed* in, not the one it is later called from, which is easy to get
 * backwards.
 */
describe("AsyncResource scope capture matches Node", () => {
  const cases: [string, (ALS: typeof NodeALS, AR: typeof NodeAR) => unknown][] = [
    [
      "created outside a scope, run inside",
      (ALS, AR) => {
        const s = new ALS();
        const resource = new AR("a");
        return s.run({ v: 1 }, () => resource.runInAsyncScope(() => s.getStore()) ?? null);
      },
    ],
    [
      "created inside a scope, run outside",
      (ALS, AR) => {
        const s = new ALS();
        const resource = s.run({ v: 2 }, () => new AR("b"));
        return resource.runInAsyncScope(() => s.getStore()) ?? null;
      },
    ],
    [
      "bound inside a scope, called outside",
      (ALS, AR) => {
        const s = new ALS();
        const bound = s.run({ v: 3 }, () => new AR("c").bind(() => s.getStore()));
        return bound() ?? null;
      },
    ],
    [
      "static bind captures the calling scope",
      (ALS, AR) => {
        const s = new ALS();
        const bound = s.run({ v: 4 }, () => AR.bind(() => s.getStore()));
        return bound() ?? null;
      },
    ],
    [
      "forwards thisArg and arguments",
      (_ALS, AR) => {
        const target = { self: true };
        return new AR("d").runInAsyncScope(
          function (this: unknown, a: never, b: never) {
            return [this === target, a, b];
          },
          target,
          1 as never,
          2 as never,
        );
      },
    ],
  ];

  test.each(cases)("%s", (_name, run) => {
    const ours = run(
      AsyncLocalStorage as unknown as typeof NodeALS,
      AsyncResource as unknown as typeof NodeAR,
    );
    expect(JSON.stringify(ours)).toBe(JSON.stringify(run(NodeALS, NodeAR)));
  });
});

describe("AsyncResource identity", () => {
  test.each([42, undefined, null])("rejects a non-string type, as Node does: %s", (type) => {
    expect(() => new AsyncResource(type as never)).toThrow(TypeError);
    expect(() => new NodeAR(type as never)).toThrow(TypeError);
  });

  test("accepts an empty type, as Node does", () => {
    expect(() => new AsyncResource("")).not.toThrow();
    expect(() => new NodeAR("")).not.toThrow();
  });

  test("ids are stable per resource and unique across them", () => {
    const a = new AsyncResource("a");
    const b = new AsyncResource("b");
    expect(a.asyncId()).toBe(a.asyncId());
    expect(a.asyncId()).not.toBe(b.asyncId());
  });

  test("triggerAsyncId defaults to 0 and honours the option", () => {
    expect(new AsyncResource("a").triggerAsyncId()).toBe(0);
    expect(new AsyncResource("a", { triggerAsyncId: 7 }).triggerAsyncId()).toBe(7);
  });
});
