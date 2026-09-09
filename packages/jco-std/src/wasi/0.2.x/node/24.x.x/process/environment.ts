import { invalidArgType } from "../errors/core.js";
import { deprecated } from "./validation.js";
import type { ProcessHost, HostCall } from "./types.js";
/** Environment access stays live on the provider, including reflection and deletion. */
export function createEnvironment(
  host: ProcessHost,
  call: HostCall,
): Record<string, string | undefined> {
  const envTarget: Record<string, string | undefined> = {};
  const envSet = (key: string, value: unknown): boolean => {
    if (!["string", "number", "boolean"].includes(typeof value)) {
      deprecated("env implicit conversion", "assign a string, number, or boolean, or use delete");
    }
    call(() => host.envSet(key, String(value)));
    return true;
  };
  return new Proxy(envTarget, {
    get: (target, key) =>
      typeof key === "string"
        ? (call(() => host.envGet(key)) ?? Reflect.get(target, key))
        : Reflect.get(target, key),
    set: (_, key, value) => {
      if (typeof key !== "string") {
        throw invalidArgType("name", "string", key);
      }
      return envSet(key, value);
    },
    has: (target, key) =>
      (typeof key === "string" && call(() => host.envGet(key)) !== undefined) ||
      Reflect.has(target, key),
    ownKeys: () => call(() => host.envEntries()).map(([key]) => key),
    getOwnPropertyDescriptor: (_, key) => {
      if (typeof key !== "string") {
        return undefined;
      }
      const value = call(() => host.envGet(key));
      return value === undefined
        ? undefined
        : { value, writable: true, enumerable: true, configurable: true };
    },
    deleteProperty: (_, key) => {
      if (typeof key === "string") {
        call(() => host.envSet(key, undefined));
      }
      return true;
    },
    defineProperty: (_, key, d) => {
      if (
        typeof key !== "string" ||
        !d.configurable ||
        !d.enumerable ||
        !d.writable ||
        !("value" in d)
      ) {
        throw Object.assign(
          new TypeError(
            "'process.env' only accepts a configurable, writable, and enumerable data descriptor",
          ),
          { code: "ERR_INVALID_OBJECT_DEFINE_PROPERTY" },
        );
      }
      return envSet(key, d.value);
    },
    preventExtensions: () => false,
  });
}
