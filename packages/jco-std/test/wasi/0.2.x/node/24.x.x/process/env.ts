import nativeProcess from "node:process";
import { expect, test } from "vitest";
import { process } from "../helpers/process.js";
test("env is live and supports reflection, assignment and deletion", () => {
  const key = "JCO_PROCESS_ENV_UNIT";
  const old = nativeProcess.env[key];
  try {
    process.env[key] = "guest";
    expect(nativeProcess.env[key]).toBe("guest");
    nativeProcess.env[key] = "host";
    expect(process.env[key]).toBe("host");
    expect(Object.keys(process.env)).toContain(key);
    expect(key in process.env).toBe(true);
    expect(Object.getOwnPropertyDescriptor(process.env, key)).toEqual({
      value: "host",
      enumerable: true,
      writable: true,
      configurable: true,
    });
    delete process.env[key];
    expect(process.env[key]).toBeUndefined();
  } finally {
    if (old === undefined) {
      delete nativeProcess.env[key];
    } else {
      nativeProcess.env[key] = old;
    }
  }
});
test("env deprecated coercion and invalid descriptors have no side effects", () => {
  const value = {
    toString() {
      throw new Error("coerced");
    },
  };
  expect(() => Reflect.set(process.env, "JCO_PROCESS_ENV_UNIT", value)).toThrow(
    expect.objectContaining({ code: "ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API" }),
  );
  expect(() =>
    Object.defineProperty(process.env, "JCO_PROCESS_ENV_UNIT", {
      get() {
        throw new Error("getter");
      },
    }),
  ).toThrow(expect.objectContaining({ code: "ERR_INVALID_OBJECT_DEFINE_PROPERTY" }));
});
