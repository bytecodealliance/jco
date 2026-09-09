/**
 * readable-stream initializes its EventEmitter base with EventEmitter.call(this).
 * Jco's audited unenv emitter is an ES class with public instance state. Adapt
 * that constructor call while keeping its prototype and instanceof identity.
 */
export function callableEmitter<T extends new (...args: unknown[]) => object>(Emitter: T): T {
  // Node's on/off are aliases. unenv forwards through this.addListener and
  // this.removeListener, which recurses when Readable overrides those methods.
  for (const [name, target] of [
    ["on", "addListener"],
    ["off", "removeListener"],
  ]) {
    Object.defineProperty(Emitter.prototype, name, {
      ...Object.getOwnPropertyDescriptor(Emitter.prototype, name),
      value: Reflect.get(Emitter.prototype, target),
    });
  }
  return new Proxy(Emitter, {
    apply(target: T, receiver: object, args: unknown[]): object {
      const initial = Reflect.construct(target, args);
      for (const key of Reflect.ownKeys(initial)) {
        if (!Object.prototype.hasOwnProperty.call(receiver, key)) {
          Object.defineProperty(receiver, key, Object.getOwnPropertyDescriptor(initial, key)!);
        }
      }
      return receiver;
    },
  });
}
