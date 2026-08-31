/**
 * Minimal `EventEmitter` for jco-std's own shims.
 *
 * Several Node modules are EventEmitters -- `cluster` and `cluster.Worker` today, more later -- but
 * shim code cannot get one from `node:events`. Guests reach that specifier through unenv, which
 * jco-std does not depend on and deliberately does not: a shim importing a `node:*` builtin relies
 * on a bundler rewriting it, which is not true of every way jco-std is consumed.
 *
 * So this is the internal one. It implements the subset the shims reach, not Node's full surface.
 * Deliberately absent: `errorMonitor`, `captureRejections`, `[Symbol.for('nodejs.rejection')]`, and
 * the `newListener`/`removeListener` meta-events -- reaching for one throws rather than silently
 * doing nothing.
 *
 * If a shim ever needs more of the surface, revisit whether jco-std should own a full
 * implementation instead of tracking unenv's separately.
 */

import { unsupported } from "../cluster/errors.js";

type Listener = (...args: unknown[]) => void;

interface Registration {
  listener: Listener;
  once: boolean;
}

export class EventEmitter {
  readonly #events = new Map<string, Registration[]>();
  #maxListeners = 10;

  #add(event: string, listener: Listener, once: boolean, prepend: boolean): this {
    if (event === "newListener" || event === "removeListener") {
      throw unsupported(
        `EventEmitter '${event}' meta-event`,
        "Jco's cluster shim implements only the ordinary event surface",
      );
    }
    const registrations = this.#events.get(event) ?? [];
    const registration: Registration = { listener, once };
    if (prepend) {
      registrations.unshift(registration);
    } else {
      registrations.push(registration);
    }
    this.#events.set(event, registrations);
    return this;
  }

  on(event: string, listener: Listener): this {
    return this.#add(event, listener, false, false);
  }

  addListener(event: string, listener: Listener): this {
    return this.#add(event, listener, false, false);
  }

  once(event: string, listener: Listener): this {
    return this.#add(event, listener, true, false);
  }

  prependListener(event: string, listener: Listener): this {
    return this.#add(event, listener, false, true);
  }

  prependOnceListener(event: string, listener: Listener): this {
    return this.#add(event, listener, true, true);
  }

  off(event: string, listener: Listener): this {
    return this.removeListener(event, listener);
  }

  removeListener(event: string, listener: Listener): this {
    const registrations = this.#events.get(event);
    if (!registrations) {
      return this;
    }
    // Node removes the most recently added matching listener.
    for (let i = registrations.length - 1; i >= 0; i -= 1) {
      if (registrations[i].listener === listener) {
        registrations.splice(i, 1);
        break;
      }
    }
    if (registrations.length === 0) {
      this.#events.delete(event);
    }
    return this;
  }

  removeAllListeners(event?: string): this {
    if (event === undefined) {
      this.#events.clear();
    } else {
      this.#events.delete(event);
    }
    return this;
  }

  emit(event: string, ...args: unknown[]): boolean {
    const registrations = this.#events.get(event);
    if (!registrations || registrations.length === 0) {
      // Node throws an unhandled 'error' event rather than returning false.
      if (event === "error") {
        throw args[0] instanceof Error
          ? args[0]
          : new Error(`Unhandled error. (${String(args[0])})`);
      }
      return false;
    }
    // Copy first: a listener may add or remove listeners while running.
    for (const registration of [...registrations]) {
      if (registration.once) {
        this.removeListener(event, registration.listener);
      }
      registration.listener(...args);
    }
    return true;
  }

  listeners(event: string): Listener[] {
    return (this.#events.get(event) ?? []).map((registration) => registration.listener);
  }

  rawListeners(event: string): Listener[] {
    return this.listeners(event);
  }

  listenerCount(event: string): number {
    return this.#events.get(event)?.length ?? 0;
  }

  eventNames(): string[] {
    return [...this.#events.keys()];
  }

  setMaxListeners(value: number): this {
    this.#maxListeners = value;
    return this;
  }

  getMaxListeners(): number {
    return this.#maxListeners;
  }
}
