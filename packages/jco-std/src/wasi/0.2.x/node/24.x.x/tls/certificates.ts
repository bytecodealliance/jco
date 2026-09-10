/** Preserve named/default identity without querying trust during component snapshots. */
export function lazyCertificates(read: () => string[]): readonly string[] {
  const certificates: string[] = [];
  let loaded = false;
  function load(): string[] {
    if (!loaded) {
      const values = read();
      certificates.push(...values);
      Object.freeze(certificates);
      loaded = true;
    }
    return certificates;
  }
  return new Proxy(certificates, {
    get: (_target, key) => Reflect.get(load(), key),
    set: (_target, key, value) => Reflect.set(load(), key, value),
    has: (_target, key) => Reflect.has(load(), key),
    ownKeys: () => Reflect.ownKeys(load()),
    getOwnPropertyDescriptor: (_target, key) => Reflect.getOwnPropertyDescriptor(load(), key),
    isExtensible: () => Reflect.isExtensible(load()),
    preventExtensions: () => Reflect.preventExtensions(load()),
    defineProperty: (_target, key, descriptor) => Reflect.defineProperty(load(), key, descriptor),
    deleteProperty: (_target, key) => Reflect.deleteProperty(load(), key),
  });
}
