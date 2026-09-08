import { invalidArgType } from "./errors/core.js";

/**
 * Adapt the legacy AbortSignal implementation embedded in ComponentizeJS 0.22.
 * Keep native signal identities and dependency tracking. Engines with the
 * standard sequence-taking any() implementation need no changes.
 * Upstream fixes: bytecodealliance/StarlingMonkey#310.
 */
function installAbortCompatibility(): void {
  const Controller = globalThis.AbortController;
  const Signal = globalThis.AbortSignal;
  if (!Controller || !Signal || typeof Signal.any !== "function") {
    return;
  }
  const nativeAny = Signal.any;
  const aborted = Object.getOwnPropertyDescriptor(Signal.prototype, "aborted")!.get!;
  const reason = Object.getOwnPropertyDescriptor(Signal.prototype, "reason")!.get!;

  try {
    // The old engine takes variadic signals, not an array. Probe with a real
    // signal: passing an array to it misreads the array's internal slots.
    // Correct implementations reject this non-sequence without touching it.
    const probe = Reflect.apply(nativeAny, Signal, [new Controller().signal]);
    if (Reflect.apply(aborted, probe, []) !== false) {
      return;
    }
  } catch {
    return;
  }

  const nativeAbort = Signal.abort;
  const nativeControllerAbort = Controller.prototype.abort;
  const methods = {
    any(signals: AbortSignal[]): AbortSignal {
      if (!Array.isArray(signals)) {
        throw invalidArgType("signals", "Array", signals);
      }
      // Validate every input before native code accesses its reserved slots.
      const inputs = Array.from(signals);
      for (let index = 0; index < inputs.length; index++) {
        try {
          Reflect.apply(aborted, inputs[index], []);
        } catch {
          throw invalidArgType(`signals[${index}]`, "AbortSignal", inputs[index]);
        }
      }
      return inputs.length ? Reflect.apply(nativeAny, Signal, inputs) : new Controller().signal;
    },
    abort(value?: unknown): AbortSignal {
      // The legacy native method requires an argument, even when undefined.
      return Reflect.apply(nativeAbort, Signal, [value]);
    },
    throwIfAborted(this: AbortSignal): void {
      if (Reflect.apply(aborted, this, [])) {
        // The legacy native method sets an exception but reports success.
        throw Reflect.apply(reason, this, []);
      }
    },
  };
  const controllerMethods = {
    abort(this: AbortController, value?: unknown): void {
      if (value === undefined) {
        // Generate the native default reason once, then pass it explicitly so
        // the source and all dependent signals receive the exact same object.
        const defaults = new Controller();
        Reflect.apply(nativeControllerAbort, defaults, []);
        value = Reflect.apply(reason, defaults.signal, []);
      }
      Reflect.apply(nativeControllerAbort, this, [value]);
    },
  };
  Object.defineProperties(Signal, {
    any: { ...Object.getOwnPropertyDescriptor(Signal, "any"), value: methods.any },
    abort: { ...Object.getOwnPropertyDescriptor(Signal, "abort"), value: methods.abort },
  });
  Object.defineProperty(Signal.prototype, "throwIfAborted", {
    ...Object.getOwnPropertyDescriptor(Signal.prototype, "throwIfAborted"),
    value: methods.throwIfAborted,
  });
  Object.defineProperty(Controller.prototype, "abort", {
    ...Object.getOwnPropertyDescriptor(Controller.prototype, "abort"),
    value: controllerMethods.abort,
  });
}

installAbortCompatibility();

export const AbortController = globalThis.AbortController;
export const AbortSignal = globalThis.AbortSignal;
