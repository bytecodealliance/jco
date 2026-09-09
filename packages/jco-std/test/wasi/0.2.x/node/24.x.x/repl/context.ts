// The evaluation context: `globalThis` with Node's module scaffolding, and nothing auto-loaded.
// Kept apart from the differential files: Node's own REPL installs lazy getters for every core
// module on the global it runs against, which would mask what this port deliberately omits.
import { expect, test } from "vitest";
import { Module } from "../../../../../../src/wasi/0.2.x/node/24.x.x/module/module-class.js";
import { open, portable } from "../helpers/repl.js";

test("the context is the global object with module and require defined", async () => {
  const session = open(portable);
  expect(session.repl.context).toBe(globalThis);
  const context = session.repl.context as { module?: unknown; require?: unknown };
  expect(context.module).toBeInstanceOf(Module);
  expect((context.module as Module).id).toBe("<repl>");
  expect(typeof context.require).toBe("function");
  for (const name of ["module", "require", "_", "_error"]) {
    expect(Object.getOwnPropertyDescriptor(globalThis, name)?.enumerable).toBe(false);
  }
  session.input.run(["typeof require", "module.id", "typeof fs", "typeof string_decoder"]);
  const text = await session.finish();
  expect(text).toBe("> 'function'\n> '<repl>'\n> 'undefined'\n> 'undefined'\n> ");
});

test("core modules are not auto-loaded and get no getters on the global", async () => {
  const session = open(portable);
  for (const name of ["fs", "path", "os", "util"]) {
    expect(Object.getOwnPropertyDescriptor(globalThis, name)).toBeUndefined();
  }
  session.input.run(["fs"]);
  const text = await session.finish();
  expect(text).toBe("> Uncaught ReferenceError: fs is not defined\n> ");
});

test("values placed on the context are visible to evaluated code", async () => {
  const session = open(portable);
  (session.repl.context as { contextInjected?: string }).contextInjected = "message";
  session.input.run(["contextInjected"]);
  const text = await session.finish();
  expect(text).toBe("> 'message'\n> ");
  Reflect.deleteProperty(globalThis, "contextInjected");
});
