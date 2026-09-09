// Differential cases require the pinned Node 24 major; portable fixtures run on every major.
import native from "node:readline";
import nativePromises from "node:readline/promises";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, test, expect } from "vitest";
import readline, * as namespace from "../../../../../../src/wasi/0.2.x/node/24.x.x/readline.js";
import promises, * as promiseNamespace from "../../../../../../src/wasi/0.2.x/node/24.x.x/readline-promises.js";

describe("readline module contract (Node 24)", () => {
  test
    .skipIf(!process.versions.node.startsWith("24."))
    .concurrent("matches exports, aliases, constructors and prototypes", () => {
      expect(Object.keys(readline).sort()).toEqual(Object.keys(native).sort());
      expect(Object.keys(promises).sort()).toEqual(Object.keys(nativePromises).sort());
      expect(Object.keys(namespace).sort()).toEqual([...Object.keys(native), "default"].sort());
      expect(Object.keys(promiseNamespace).sort()).toEqual(
        [...Object.keys(nativePromises), "default"].sort(),
      );
      expect(readline.promises).toBe(promises);
      expect(namespace.Interface).toBe(readline.Interface);
      expect(promiseNamespace.Interface).toBe(promises.Interface);
      expect(Object.getPrototypeOf(readline.Interface.prototype)).toBe(
        Object.getPrototypeOf(promises.Interface.prototype),
      );
      for (const value of Object.values(Object.getOwnPropertyDescriptors(readline))) {
        expect([value.enumerable, value.configurable, value.writable]).toEqual([true, true, true]);
      }
      const rl = readline.Interface({ input: new PassThrough() });
      expect(rl).toBeInstanceOf(readline.Interface);
      expect(rl).toBeInstanceOf(EventEmitter);
      class Derived extends readline.Interface {}
      const derived = new Derived({ input: new PassThrough() });
      expect(derived).toBeInstanceOf(Derived);
      expect(Object.getOwnPropertyNames(readline.Interface.prototype).sort()).toEqual(
        Object.getOwnPropertyNames(native.Interface.prototype).sort(),
      );
      rl.close();
      derived.close();
    });
  test.concurrent("disposal closes once", () => {
    const rl = readline.createInterface(new PassThrough());
    let closed = 0;
    rl.on("close", () => closed++);
    rl[Symbol.dispose]();
    rl.close();
    expect(closed).toBe(1);
  });
});

test
  .skipIf(!process.versions.node.startsWith("24."))
  .concurrent("callback prototype descriptors match Node", () => {
    for (const key of Reflect.ownKeys(native.Interface.prototype)) {
      if (typeof key !== "string") {
        continue;
      }
      const expected = Object.getOwnPropertyDescriptor(native.Interface.prototype, key)!;
      const actual = Object.getOwnPropertyDescriptor(readline.Interface.prototype, key)!;
      expect([
        actual.enumerable,
        actual.configurable,
        actual.writable,
        typeof actual.get,
        typeof actual.set,
      ]).toEqual([
        expected.enumerable,
        expected.configurable,
        expected.writable,
        typeof expected.get,
        typeof expected.set,
      ]);
    }
    expect(readline.Interface.length).toBe(native.Interface.length);
    expect(promises.Readline.length).toBe(nativePromises.Readline.length);
  });
