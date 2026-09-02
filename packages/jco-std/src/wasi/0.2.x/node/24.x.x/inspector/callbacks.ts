/**
 * The guest-exported `jco:node/inspector-callbacks@0.1.0` interface: the channel the host uses to
 * re-enter the component when a protocol response or a notification arrives.
 *
 * A component cannot implement a resource declared in an *imported* interface -- its methods would
 * run host-side. So the callback resources are exported here, the guest owns their implementations,
 * and the host redeems a `u32` id (passed on the matching import call) for an owned handle through
 * the `take-*` functions before invoking a method.
 *
 * There is one registry per component. `session.ts` registers callbacks into it and passes their
 * ids to the host; the exported functions hand the resources back to the host on demand.
 */

/** The JS callback a `session.post` caller supplied: `(err, result)`. */
export type PostCallbackFn = (error: Error | null, result: object | undefined) => void;

/** How a session re-emits one arriving notification. */
export type NotifyFn = (method: string, paramsJson: string) => void;

/** Reconstruct the `(err, result)` pair from the JSON the host delivers. */
function parseResponse(
  errorJson: string | undefined,
  resultJson: string | undefined,
): { error: Error | null; result: object | undefined } {
  if (errorJson !== undefined) {
    const parsed = JSON.parse(errorJson) as { code?: unknown; message?: unknown };
    const message = typeof parsed.message === "string" ? parsed.message : String(errorJson);
    const error = new Error(message) as Error & { code?: string };
    if (typeof parsed.code === "string") {
      error.code = parsed.code;
    }
    return { error, result: undefined };
  }
  const result = resultJson !== undefined ? (JSON.parse(resultJson) as object) : undefined;
  return { error: null, result };
}

/**
 * One-shot response to a `session.post`. The host redeems it, calls `done` exactly once, then drops
 * it. Reconstructing the error guest-side keeps `ERR_INSPECTOR_COMMAND` faithful.
 */
export class PostCallback {
  readonly #fn: PostCallbackFn;

  constructor(fn: PostCallbackFn) {
    this.#fn = fn;
  }

  done(errorJson: string | undefined, resultJson: string | undefined): void {
    const { error, result } = parseResponse(errorJson, resultJson);
    this.#fn(error, result);
  }
}

/**
 * The long-lived channel for one connected session's notifications. The host redeems it once at
 * connect, keeps the handle, and calls `notify` per CDP notification until it drops the handle at
 * disconnect.
 */
export class NotificationListener {
  readonly #fn: NotifyFn;

  constructor(fn: NotifyFn) {
    this.#fn = fn;
  }

  notify(method: string, paramsJson: string): void {
    this.#fn(method, paramsJson);
  }
}

/** The exported interface object, as componentize-js binds it. */
export interface InspectorCallbacks {
  PostCallback: typeof PostCallback;
  NotificationListener: typeof NotificationListener;
  takePostCallback(id: number): PostCallback | undefined;
  takeNotificationListener(id: number): NotificationListener | undefined;
}

/**
 * The per-component callback registry shared between the session shim and the exported interface.
 *
 * Ids are `u32`s from a single counter; a given id is only ever one kind, so the two maps never
 * collide. `register*` returns the id to pass to the host; `take*` hands the resource to the host
 * and removes it (one-shot for posts; the host owns the listener handle after taking it).
 */
export class CallbackRegistry {
  #nextId = 1;
  readonly #posts = new Map<number, PostCallback>();
  readonly #listeners = new Map<number, NotificationListener>();

  #allocate(): number {
    // u32 space; wrap defensively rather than ever colliding with a live entry.
    let id = this.#nextId;
    this.#nextId = id >= 0xffffffff ? 1 : id + 1;
    while (this.#posts.has(id) || this.#listeners.has(id)) {
      id = this.#nextId;
      this.#nextId = id >= 0xffffffff ? 1 : id + 1;
    }
    return id;
  }

  registerPost(fn: PostCallbackFn): number {
    const id = this.#allocate();
    this.#posts.set(id, new PostCallback(fn));
    return id;
  }

  registerListener(fn: NotifyFn): number {
    const id = this.#allocate();
    this.#listeners.set(id, new NotificationListener(fn));
    return id;
  }

  /** Drop a pending registration the host never took, e.g. when the import call threw. */
  releasePost(id: number): void {
    this.#posts.delete(id);
  }

  releaseListener(id: number): void {
    this.#listeners.delete(id);
  }

  takePost(id: number): PostCallback | undefined {
    const callback = this.#posts.get(id);
    this.#posts.delete(id);
    return callback;
  }

  takeListener(id: number): NotificationListener | undefined {
    const listener = this.#listeners.get(id);
    this.#listeners.delete(id);
    return listener;
  }
}

/** Build the exported interface object over a registry. */
export function createInspectorCallbacks(registry: CallbackRegistry): InspectorCallbacks {
  return {
    PostCallback,
    NotificationListener,
    takePostCallback: (id) => registry.takePost(id),
    takeNotificationListener: (id) => registry.takeListener(id),
  };
}
