/** Adapted from nodejs/node lib/internal/test_runner/{assert,snapshot,test}.js,
 * v24.20.0, 71b8b174857e25106d39b61a9e6f30d927da8b01, MIT (see LICENSE).
 * Uses jco-std assertions; snapshot files/VM execution are explicitly unsupported. */
import nodeAssert, { type Assert } from "../assert/index.js";
import type { TestContext } from "./context.js";
import { invalidArgType, unsupported, validateFunction } from "./errors.js";

const methods = [
  "deepEqual",
  "deepStrictEqual",
  "doesNotMatch",
  "doesNotReject",
  "doesNotThrow",
  "equal",
  "fail",
  "ifError",
  "match",
  "notDeepEqual",
  "notDeepStrictEqual",
  "notEqual",
  "notStrictEqual",
  "partialDeepStrictEqual",
  "rejects",
  "strictEqual",
  "throws",
  "ok",
] as const;
export interface TestAssertions extends Pick<Assert, (typeof methods)[number]> {
  // Explicit properties retain assertion narrowing through a TestContext getter.
  ok: Assert["ok"];
  strictEqual: Assert["strictEqual"];
  deepStrictEqual: Assert["deepStrictEqual"];
  snapshot(value: unknown, options?: { serializers?: readonly SnapshotSerializer[] }): void;
  fileSnapshot(
    value: unknown,
    path: string,
    options?: { serializers?: readonly SnapshotSerializer[] },
  ): void;
}
export type AssertionFunction = (this: TestContext, ...args: never[]) => unknown;
export interface AssertionRegistry {
  register(name: string, fn: AssertionFunction): void;
}
export type SnapshotSerializer = (value: unknown) => string;
export interface SnapshotConfiguration {
  setDefaultSnapshotSerializers(serializers: readonly SnapshotSerializer[]): void;
  setResolveSnapshotPath(fn: (path: string | undefined) => string): void;
}
export const assertionMap: Map<string, AssertionFunction> = new Map(
  methods.map((name) => [name, nodeAssert[name]]),
);
export const assert: AssertionRegistry = Object.assign(Object.create(null), {
  register(name: string, fn: AssertionFunction): void {
    if (typeof name !== "string") {
      throw invalidArgType("name", "string", name);
    }
    validateFunction(fn, "fn");
    assertionMap.set(name, fn);
  },
});
export const snapshot: SnapshotConfiguration = Object.assign(Object.create(null), {
  setDefaultSnapshotSerializers(_serializers: readonly SnapshotSerializer[]): void {
    unsupported(
      "snapshot.setDefaultSnapshotSerializers()",
      "snapshot files and VM loading are unavailable",
    );
  },
  setResolveSnapshotPath(_fn: (path: string | undefined) => string): void {
    unsupported(
      "snapshot.setResolveSnapshotPath()",
      "snapshot files and VM loading are unavailable",
    );
  },
});
export function createAssertions(context: TestContext, count: () => void): TestAssertions {
  // Every public method is installed below before this object escapes.
  const assertions: TestAssertions = Object.create(null);
  const map = new Map(assertionMap);
  if (!map.has("snapshot")) {
    map.set("snapshot", (): never =>
      unsupported("context.assert.snapshot()", "snapshot files and VM loading are unavailable"),
    );
  }
  if (!map.has("fileSnapshot")) {
    map.set("fileSnapshot", (): never =>
      unsupported("context.assert.fileSnapshot()", "snapshot files are unavailable"),
    );
  }
  for (const [name, method] of map) {
    Object.defineProperty(assertions, name, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: (...args: unknown[]): unknown => {
        count();
        return Reflect.apply(method, context, args);
      },
    });
  }
  // Every member of TestAssertions is installed by the map above, retaining its call contract.
  return assertions;
}
