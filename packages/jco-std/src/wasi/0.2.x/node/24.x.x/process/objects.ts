import type { Json } from "./types.js";
/** A lazy object preserves named/default identity without touching host imports during Wizer. */
export function lazy<T extends object>(target: T, read: () => T): T {
  let value: T | undefined;
  const get = (): T => (value ??= read());
  return new Proxy(target, {
    get: (_, key) => Reflect.get(get(), key),
    set: (_, key, value) => Reflect.set(get(), key, value),
    has: (_, key) => Reflect.has(get(), key),
    ownKeys: () => Reflect.ownKeys(get()),
    getOwnPropertyDescriptor: (_, key) => {
      const d = Reflect.getOwnPropertyDescriptor(get(), key);
      return d && { ...d, configurable: key === "length" && Array.isArray(target) ? false : true };
    },
    defineProperty: (_, key, d) =>
      d.configurable === false ? false : Reflect.defineProperty(get(), key, d),
    deleteProperty: (_, key) => Reflect.deleteProperty(get(), key),
    preventExtensions: () => false,
  });
}
export function freeze(value: Json): Json {
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      freeze(item);
    }
    Object.freeze(value);
  }
  return value;
}
