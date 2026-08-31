import type { BoundStore, MessageHandler, StoreTransform } from "./types.js";

/**
 * A named publish/subscribe channel, matching Node's `diagnostics_channel.Channel`.
 *
 * Channels are interned by name so `channel(name)` returns the same object every time, which is
 * what lets a publisher and a subscriber find each other without sharing a reference.
 */
export class Channel {
  readonly name: string;
  readonly #subscribers: MessageHandler[] = [];
  readonly #stores = new Map<BoundStore, StoreTransform>();

  constructor(name: string) {
    this.name = name;
  }

  /** Whether anything is listening. Publishers check this to skip building a message. */
  get hasSubscribers(): boolean {
    return this.#subscribers.length > 0;
  }

  /**
   * Deliver `message` to every subscriber.
   *
   * Bound stores are deliberately not applied: Node applies them from `runStores`, not `publish`.
   */
  publish(message: unknown): void {
    if (this.#subscribers.length === 0) {
      return;
    }
    // Copy first: a subscriber may subscribe or unsubscribe while running.
    for (const subscriber of [...this.#subscribers]) {
      subscriber(message, this.name);
    }
  }

  subscribe(onMessage: MessageHandler): void {
    this.#subscribers.push(onMessage);
  }

  /** Remove a subscriber, reporting whether one was actually registered. */
  unsubscribe(onMessage: MessageHandler): boolean {
    const index = this.#subscribers.indexOf(onMessage);
    if (index === -1) {
      return false;
    }
    this.#subscribers.splice(index, 1);
    return true;
  }

  /**
   * Bind a store so published data is visible through it while subscribers run.
   *
   * The store only has to offer `run`, so jco-std's `AsyncLocalStorage` and Node's both work. Note
   * the scoping is synchronous: see the async-hooks module for why a store cannot follow an await.
   */
  bindStore(store: BoundStore, transform: StoreTransform = (data) => data): void {
    this.#stores.set(store, transform);
  }

  unbindStore(store: BoundStore): boolean {
    return this.#stores.delete(store);
  }

  /**
   * Publish `data`, then run `fn` with it visible through every bound store.
   *
   * Node publishes from here as well as applying the stores, so subscribers see the message with
   * the stores already entered.
   */
  runStores<R>(data: unknown, fn: (...args: never[]) => R, thisArg?: unknown, ...args: never[]): R {
    return this.#runWithStores(data, () => {
      this.publish(data);
      return Reflect.apply(fn, thisArg, args) as R;
    });
  }

  /** Nest every bound store around `fn`, innermost last. */
  #runWithStores<R>(data: unknown, fn: () => R): R {
    let run = fn;
    for (const [store, transform] of this.#stores) {
      const inner = run;
      run = () => store.run(transform(data), inner);
    }
    return run();
  }
}

/** Interned channels, so a name always maps to one instance. */
const channels = new Map<string, Channel>();

export function channel(name: string): Channel {
  const existing = channels.get(name);
  if (existing) {
    return existing;
  }
  const created = new Channel(name);
  channels.set(name, created);
  return created;
}

/** Whether a channel with this name exists and has subscribers. */
export function hasSubscribers(name: string): boolean {
  return channels.get(name)?.hasSubscribers ?? false;
}

export function subscribe(name: string, onMessage: MessageHandler): void {
  channel(name).subscribe(onMessage);
}

export function unsubscribe(name: string, onMessage: MessageHandler): boolean {
  return channel(name).unsubscribe(onMessage);
}
