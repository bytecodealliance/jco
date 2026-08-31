import { describe, expect, test } from "vitest";

import { AsyncLocalStorage as NodeALS } from "node:async_hooks";

import { AsyncLocalStorage } from "../../../../../../src/wasi/0.2.x/node/24.x.x/async-hooks/async-local-storage.js";

/**
 * Synchronous behavior, asserted against Node's own `AsyncLocalStorage` so the two agree rather
 * than merely matching a written-down expectation.
 */
describe("AsyncLocalStorage synchronous scopes", () => {
  const cases: [string, (ALS: typeof NodeALS | typeof AsyncLocalStorage) => unknown][] = [
    [
      "store inside run",
      (ALS) => {
        const s = new ALS();
        return s.run({ v: 1 }, () => s.getStore());
      },
    ],
    [
      "undefined outside run",
      (ALS) => {
        const s = new ALS();
        return s.getStore() ?? null;
      },
    ],
    [
      "restores the outer scope",
      (ALS) => {
        const s = new ALS();
        return s.run({ v: 1 }, () => {
          s.run({ v: 2 }, () => undefined);
          return s.getStore();
        });
      },
    ],
    [
      "innermost wins when nested",
      (ALS) => {
        const s = new ALS();
        return s.run({ v: 1 }, () => s.run({ v: 2 }, () => s.getStore()));
      },
    ],
    [
      "exit clears the store",
      (ALS) => {
        const s = new ALS();
        return s.run({ v: 1 }, () => s.exit(() => s.getStore() ?? null));
      },
    ],
    [
      "enterWith sets the current scope",
      (ALS) => {
        const s = new ALS();
        return s.run({ v: 1 }, () => {
          s.enterWith({ v: 9 });
          return s.getStore();
        });
      },
    ],
    [
      "disable clears the store",
      (ALS) => {
        const s = new ALS();
        return s.run({ v: 1 }, () => {
          s.disable();
          return s.getStore() ?? null;
        });
      },
    ],
    [
      "run forwards extra arguments",
      (ALS) => {
        const s = new ALS();
        return s.run({ v: 1 }, (a: never, b: never) => [a, b], 1 as never, 2 as never);
      },
    ],
    [
      "storages are independent",
      (ALS) => {
        const a = new ALS();
        const b = new ALS();
        return a.run({ v: "a" }, () => b.run({ v: "b" }, () => [a.getStore(), b.getStore()]));
      },
    ],
    [
      "snapshot restores the captured store",
      (ALS) => {
        const s = new ALS();
        const snap = s.run({ v: 1 }, () => (ALS as typeof NodeALS).snapshot());
        return snap(() => s.getStore());
      },
    ],
  ];

  test.each(cases)("%s matches Node", (_name, run) => {
    expect(JSON.stringify(run(AsyncLocalStorage))).toBe(JSON.stringify(run(NodeALS)));
  });
});
