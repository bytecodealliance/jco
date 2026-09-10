// Adapted from Node v24.20.0 lib/internal/abort_controller.js, aborted(), MIT,
// commit 71b8b174857e25106d39b61a9e6f30d927da8b01. Weak event resources use engine
// WeakRef/FinalizationRegistry; unsupported engines fail before installing listeners.
import { validateAbortSignal } from "../stream/shared.js";
import { invalidArgType, unsupportedNodeApi } from "../errors/core.js";

interface Subscription {
  signal: WeakRef<AbortSignal>;

  listener: () => void;
}

let registry: FinalizationRegistry<Subscription> | undefined;

export async function aborted(signal: AbortSignal, resource: object): Promise<void> {
  validateAbortSignal(signal, "signal");
  if (signal === undefined) {
    throw invalidArgType("signal", "AbortSignal", signal);
  }
  if (resource === null || (typeof resource !== "object" && typeof resource !== "function")) {
    throw invalidArgType("resource", "Object", resource);
  }
  if (signal.aborted) {
    return;
  }
  if (typeof WeakRef !== "function" || typeof FinalizationRegistry !== "function") {
    throw unsupportedNodeApi("util.aborted", "the engine must support weak resource lifetimes");
  }
  registry ??= new FinalizationRegistry(({ signal, listener }: Subscription): void => {
    signal.deref()?.removeEventListener("abort", listener);
  });
  return new Promise<void>((resolve) => {
    const token = {};
    const weakResource = new WeakRef(resource);

    const listener = (): void => {
      registry!.unregister(token);
      if (weakResource.deref()) {
        resolve();
      }
    };

    registry!.register(resource, { signal: new WeakRef(signal), listener }, token);
    signal.addEventListener("abort", listener, { once: true });
  });
}
