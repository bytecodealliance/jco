/**
 * `inspector.Session` and `inspector/promises.Session`.
 *
 * The operation mapping follows nodejs/node v24.19.0, commit
 * cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, lib/inspector.js and
 * lib/inspector/promises.js (MIT license). The native `Connection` and
 * message-id map are replaced by a typed WIT host and a guest-exported
 * callback registry; argument validation keeps Node's order.
 *
 * `Session` extends jco-std's internal `EventEmitter` (shim code cannot pull one from `node:events`;
 * see `../internal/event-emitter.ts`). Session ids are guest-allocated `u32`s, so `new Session()`
 * touches no host state -- state lives here and only `connect`/`post`/`disconnect` reach the host.
 *
 * Argument validation reproduces Node's, and in Node's order: `method`, then `params`, then
 * `callback`, all *before* the connection check, so an ill-typed argument on a disconnected session
 * still reports `ERR_INVALID_ARG_TYPE` rather than `ERR_INSPECTOR_NOT_CONNECTED`.
 *
 * Notifications arrive through a `notification-listener` resource registered at connect: the host
 * calls it per CDP notification, and the session re-emits each as `inspectorNotification` and as an
 * event named for the method, both carrying the whole `{ method, params }` message, exactly as Node
 * does.
 */

import { EventEmitter } from "../internal/event-emitter.js";
import type { CallbackRegistry } from "./callbacks.js";
import {
  alreadyConnected,
  fromFailure,
  fromHostError,
  invalidArgType,
  notConnected,
} from "./errors.js";
import type { HostCommandResponse, HostConnectKind, InspectorHost } from "./types.js";

/** The `(err, result)` callback shape a `post` caller supplies. */
export type PostCallback = (error: Error | null, result: object | undefined) => void;

/** A CDP notification message, as delivered to listeners. */
export interface InspectorNotification {
  method: string;
  params: object;
}

function validatePost(
  method: unknown,
  paramsOrCallback: unknown,
  maybeCallback: unknown,
): { method: string; params: object | undefined; callback: PostCallback | undefined } {
  if (typeof method !== "string") {
    throw invalidArgType("method", "string", method);
  }
  let params: unknown;
  let callback: unknown;
  if (typeof paramsOrCallback === "function") {
    // post(method, callback)
    callback = paramsOrCallback;
    params = undefined;
  } else {
    params = paramsOrCallback;
    callback = maybeCallback;
  }
  if (
    params !== undefined &&
    params !== null &&
    (typeof params !== "object" || Array.isArray(params))
  ) {
    throw invalidArgType("params", "object", params);
  }
  if (callback !== undefined && typeof callback !== "function") {
    throw invalidArgType("callback", "function", callback);
  }
  return {
    method,
    params: (params ?? undefined) as object | undefined,
    callback: callback as PostCallback | undefined,
  };
}

/** The pair of Session classes, bound to one host and callback registry. */
export interface SessionClasses {
  Session: SessionConstructor;
  PromisesSession: PromisesSessionConstructor;
}

export interface SessionConstructor {
  new (): Session;
  prototype: Session;
}

export interface PromisesSessionConstructor {
  new (): PromisesSession;
  prototype: PromisesSession;
}

export interface Session extends EventEmitter {
  connect(): void;
  connectToMainThread(): void;
  disconnect(): void;
  post(method: string, params?: object, callback?: PostCallback): void;
  post(method: string, callback: PostCallback): void;
}

export interface PromisesSession extends EventEmitter {
  connect(): void;
  connectToMainThread(): void;
  disconnect(): void;
  post(method: string, params?: object): Promise<object | undefined>;
}

/** Invoke a `post` callback with a synchronously-resolved host response. */
function deliverResponse(response: HostCommandResponse, callback: PostCallback | undefined): void {
  if (callback === undefined) {
    return;
  }
  if (response.tag === "failed") {
    callback(fromFailure(response.val), undefined);
  } else {
    callback(null, response.val === undefined ? {} : (JSON.parse(response.val) as object));
  }
}

export function createSessions(host: InspectorHost, registry: CallbackRegistry): SessionClasses {
  let nextSessionId = 1;

  class Session extends EventEmitter {
    readonly #id = nextSessionId++;
    #connected = false;

    #connect(kind: HostConnectKind): void {
      if (this.#connected) {
        // Node reports this before consulting the host.
        throw alreadyConnected();
      }
      const listenerId = registry.registerListener((method, paramsJson) =>
        this.#onNotification(method, paramsJson),
      );
      try {
        host.sessionConnect(this.#id, kind, listenerId);
      } catch (error) {
        registry.releaseListener(listenerId);
        throw fromHostError(error);
      }
      this.#connected = true;
    }

    connect(): void {
      this.#connect("local");
    }

    connectToMainThread(): void {
      this.#connect("main-thread");
    }

    disconnect(): void {
      if (!this.#connected) {
        return;
      }
      this.#connected = false;
      try {
        host.sessionDisconnect(this.#id);
      } catch (error) {
        throw fromHostError(error);
      }
    }

    post(
      method: string,
      paramsOrCallback?: object | PostCallback,
      maybeCallback?: PostCallback,
    ): void {
      const {
        method: name,
        params,
        callback,
      } = validatePost(method, paramsOrCallback, maybeCallback);
      if (!this.#connected) {
        throw notConnected();
      }
      const paramsJson = params === undefined ? undefined : JSON.stringify(params);
      const callbackId = callback === undefined ? undefined : registry.registerPost(callback);
      let response: HostCommandResponse | undefined;
      try {
        response = host.sessionPost(this.#id, name, paramsJson, callbackId);
      } catch (error) {
        if (callbackId !== undefined) {
          registry.releasePost(callbackId);
        }
        throw fromHostError(error);
      }
      if (response !== undefined) {
        // Synchronous response: deliver it here, so an awaited `post` never needs the host to call
        // back into a suspended task. The registered callback is redundant now -- release it.
        if (callbackId !== undefined) {
          registry.releasePost(callbackId);
        }
        deliverResponse(response, callback);
      }
      // Otherwise the response is deferred: the host redeems `callbackId` and calls the resource.
    }

    #onNotification(method: string, paramsJson: string): void {
      const params = (paramsJson ? JSON.parse(paramsJson) : {}) as object;
      const message: InspectorNotification = { method, params };
      this.emit("inspectorNotification", message);
      this.emit(method, message);
    }
  }

  class PromisesSession extends Session {
    post(method: string, params?: object): Promise<object | undefined> {
      return new Promise((resolve, reject) => {
        try {
          super.post(method, params as object, (error, result) =>
            error ? reject(error) : resolve(result),
          );
        } catch (error) {
          reject(error);
        }
      });
    }
  }

  // Node's promisified `post` keeps the original arity of 3.
  Object.defineProperty(PromisesSession.prototype.post, "length", { value: 3 });

  return {
    Session: Session as unknown as SessionConstructor,
    PromisesSession: PromisesSession as unknown as PromisesSessionConstructor,
  };
}
