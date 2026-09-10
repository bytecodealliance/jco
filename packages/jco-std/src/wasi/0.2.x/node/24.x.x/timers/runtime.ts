/** Runtime bridge: engine timers own scheduling; no Node host capability is assumed. */
import { unsupportedNodeApi } from "../errors/core.js";

export interface RuntimeTimer {
  cancel(): void;
  setRef(ref: boolean): void;
}

export function schedule(
  callback: () => void,
  delay: number,
  kind: "timeout" | "interval" | "immediate",
): RuntimeTimer {
  const immediate = kind === "immediate" && typeof globalThis.setImmediate === "function";
  const name = immediate ? "setImmediate" : kind === "interval" ? "setInterval" : "setTimeout";
  const clearName = immediate
    ? "clearImmediate"
    : kind === "interval"
      ? "clearInterval"
      : "clearTimeout";
  const start: unknown = globalThis[name];
  const clear: unknown = globalThis[clearName];
  if (typeof start !== "function" || typeof clear !== "function") {
    throw unsupportedNodeApi(
      `timers.${kind === "immediate" ? "setImmediate" : name}`,
      "the engine must supply task timers",
    );
  }
  const handle: unknown = Reflect.apply(
    start,
    globalThis,
    immediate ? [callback] : [callback, delay],
  );
  return {
    cancel(): void {
      Reflect.apply(clear, globalThis, [handle]);
    },
    setRef(ref: boolean): void {
      const method = ref ? "ref" : "unref";
      if (typeof handle === "object" && handle !== null) {
        const fn: unknown = Reflect.get(handle, method);
        if (typeof fn === "function") {
          Reflect.apply(fn, handle, []);
          return;
        }
      }
      if (!ref) {
        throw unsupportedNodeApi(
          "timers.unref",
          "the engine timer handle does not support event-loop reference control",
        );
      }
    },
  };
}
