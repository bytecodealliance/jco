import inspector from "node:inspector";

import type {
  HostBroadcastTarget,
  HostCommandResponse,
  HostConnectKind,
  InspectorHost,
} from "./inspector/types.js";

/**
 * Node host adapter for `jco:node/inspector`.
 *
 * Backed by the runtime's real `node:inspector`. A transpiled component runs as a Node process, so
 * `open`/`close`/`url`/`waitForDebugger` drive that process's actual inspector, and each guest
 * `Session` maps to a real one.
 *
 * The interesting part is delivering callbacks *back* into the component without re-entering it.
 * When the guest calls an import (e.g. `session-post`), the real inspector may fire its callback
 * synchronously, while a guest->host call is still on the stack; calling back into the component
 * then would be a component-model re-entrance. So every delivery is queued and flushed on a later
 * turn via `setImmediate`. The consequence -- documented -- is that guest-side callbacks are always
 * asynchronous, even where Node fires them synchronously; Node does not promise synchronous
 * delivery.
 *
 * The adapter cannot import the component, so it exposes `attachCallbacks`, which the embedder calls
 * with the transpiled `jco:node/inspector-callbacks@0.1.0` export after instantiation. Deliveries
 * queue until then.
 */

interface PostCallbackResource {
  done(errorJson: string | undefined, resultJson: string | undefined): void;
}

interface NotificationListenerResource {
  notify(method: string, paramsJson: string): void;
}

interface CallbacksExport {
  takePostCallback(id: number): PostCallbackResource | undefined;
  takeNotificationListener(id: number): NotificationListenerResource | undefined;
}

interface SessionState {
  session: inspector.Session;
  listenerId: number;
  listener?: NotificationListenerResource;
}

const sessions = new Map<number, SessionState>();
const queue: Array<() => void> = [];
let callbacks: CallbacksExport | undefined;
let scheduled = false;

/** Wire the guest's exported callbacks interface. Call once, after instantiation. */
export function attachCallbacks(exports: CallbacksExport): void {
  callbacks = exports;
  if (queue.length > 0) {
    schedule();
  }
}

function schedule(): void {
  if (scheduled) {
    return;
  }
  scheduled = true;
  setImmediate(flush);
}

function flush(): void {
  scheduled = false;
  if (!callbacks) {
    // Still waiting for attachCallbacks; a later attach re-schedules.
    return;
  }
  const jobs = queue.splice(0, queue.length);
  for (const job of jobs) {
    job();
  }
}

function enqueue(job: () => void): void {
  queue.push(job);
  if (callbacks) {
    schedule();
  }
}

/** Wrap a caught host error as the WIT `failed` variant so it crosses the boundary as an `err`. */
function failed(error: unknown): never {
  const value = error as { code?: unknown; message?: unknown };
  throw {
    tag: "failed",
    val: {
      code: typeof value?.code === "string" ? value.code : "ERR_JCO_INSPECTOR_HOST",
      message: typeof value?.message === "string" ? value.message : String(error),
    },
  };
}

function serializeError(error: unknown): string {
  const value = error as { code?: unknown; message?: unknown };
  return JSON.stringify({
    code: typeof value?.code === "string" ? value.code : undefined,
    message: typeof value?.message === "string" ? value.message : String(error),
  });
}

function requireSession(id: number): SessionState {
  const state = sessions.get(id);
  if (!state) {
    throw { tag: "no-such-session", val: id };
  }
  return state;
}

export const open: InspectorHost["open"] = (port, host, wait) => {
  try {
    inspector.open(port, host, wait);
  } catch (error) {
    failed(error);
  }
};

export const close: InspectorHost["close"] = () => {
  try {
    inspector.close();
  } catch (error) {
    failed(error);
  }
};

export const url: InspectorHost["url"] = () => {
  try {
    return inspector.url();
  } catch (error) {
    failed(error);
  }
};

export const waitForDebugger: InspectorHost["waitForDebugger"] = () => {
  try {
    inspector.waitForDebugger();
  } catch (error) {
    failed(error);
  }
};

export const consoleCall: InspectorHost["consoleCall"] = (context, method, argsJson) => {
  try {
    const args = JSON.parse(argsJson) as unknown[];
    const consoleApi = inspector.console as unknown as Record<string, unknown> & {
      context(name: string): Record<string, unknown>;
    };
    const target = context === undefined ? consoleApi : consoleApi.context(context);
    const fn = (target as Record<string, unknown>)[method];
    if (typeof fn === "function") {
      (fn as (...values: unknown[]) => void).apply(target, args);
    }
  } catch (error) {
    failed(error);
  }
};

export const sessionConnect: InspectorHost["sessionConnect"] = (id, kind, listener) => {
  const session = new inspector.Session();
  try {
    connect(session, kind);
  } catch (error) {
    failed(error);
  }
  const state: SessionState = { session, listenerId: listener };
  sessions.set(id, state);
  session.on("inspectorNotification", (message: { method: string; params: unknown }) => {
    enqueue(() => {
      const target = resolveListener(state);
      target?.notify(message.method, JSON.stringify(message.params ?? {}));
    });
  });
};

function connect(session: inspector.Session, kind: HostConnectKind): void {
  if (kind === "main-thread") {
    session.connectToMainThread();
  } else {
    session.connect();
  }
}

function resolveListener(state: SessionState): NotificationListenerResource | undefined {
  if (!state.listener) {
    state.listener = callbacks?.takeNotificationListener(state.listenerId);
  }
  return state.listener;
}

export const sessionPost: InspectorHost["sessionPost"] = (id, method, paramsJson, callback) => {
  const state = requireSession(id);
  const params = paramsJson === undefined ? undefined : (JSON.parse(paramsJson) as object);

  // Node fires the callback synchronously for in-isolate methods. Capture that: if it lands before
  // post() returns, hand the response straight back so an awaited post never needs a re-entrant
  // callback. Only a genuinely deferred response goes through the post-callback resource.
  let returned = false;
  let synchronous: HostCommandResponse | undefined;

  const handle = (error: unknown, result: unknown): void => {
    if (!returned) {
      synchronous = toResponse(error, result);
      return;
    }
    if (callback === undefined) {
      return;
    }
    enqueue(() => {
      const resource = callbacks?.takePostCallback(callback);
      if (!resource) {
        return;
      }
      if (error) {
        resource.done(serializeError(error), undefined);
      } else {
        resource.done(undefined, JSON.stringify(result ?? {}));
      }
    });
  };

  try {
    if (params === undefined) {
      state.session.post(method, (error, result) => handle(error, result));
    } else {
      state.session.post(method, params, (error, result) => handle(error, result));
    }
  } catch (error) {
    failed(error);
  }
  returned = true;
  return synchronous;
};

/** Build the WIT `command-response` for a synchronously-delivered `(err, result)` pair. */
function toResponse(error: unknown, result: unknown): HostCommandResponse {
  if (error) {
    const value = error as { code?: unknown; message?: unknown };
    return {
      tag: "failed",
      val: {
        code: typeof value?.code === "string" ? value.code : "ERR_INSPECTOR_COMMAND",
        message: typeof value?.message === "string" ? value.message : String(error),
      },
    };
  }
  return { tag: "ok", val: result === undefined ? undefined : JSON.stringify(result) };
}

export const sessionDisconnect: InspectorHost["sessionDisconnect"] = (id) => {
  const state = sessions.get(id);
  if (!state) {
    return;
  }
  sessions.delete(id);
  try {
    state.session.disconnect();
  } catch (error) {
    failed(error);
  }
};

export const emit: InspectorHost["emit"] = (target, event, paramsJson) => {
  try {
    const params = JSON.parse(paramsJson) as object;
    const namespace = broadcastNamespace(target);
    const fn = (namespace as Record<string, unknown>)[event];
    if (typeof fn === "function") {
      (fn as (value: object) => void).call(namespace, params);
    }
  } catch (error) {
    failed(error);
  }
};

function broadcastNamespace(target: HostBroadcastTarget): object {
  const inspectorAny = inspector as unknown as Record<string, object>;
  return target === "network" ? inspectorAny.Network : inspectorAny.DOMStorage;
}

export const putNetworkResource: InspectorHost["putNetworkResource"] = (url, data) => {
  try {
    const resources = (
      inspector as unknown as { NetworkResources?: { put(url: string, data: string): void } }
    ).NetworkResources;
    resources?.put(url, data);
  } catch (error) {
    failed(error);
  }
};

export default {
  open,
  close,
  url,
  waitForDebugger,
  consoleCall,
  sessionConnect,
  sessionPost,
  sessionDisconnect,
  emit,
  putNetworkResource,
  attachCallbacks,
};
