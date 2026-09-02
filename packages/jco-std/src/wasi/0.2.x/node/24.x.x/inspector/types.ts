/** Shared types for the `node:inspector` shim and the host contract it forwards to. */

/** A failure reported by the host, mirroring the WIT `failure` record. */
export interface HostFailure {
  code: string;
  message: string;
}

/**
 * A host failure, mirroring the WIT `variant error`.
 *
 * jco lowers a thrown object of this shape to the interface's `result` error case, so the deny
 * adapter and the Node adapter both raise these rather than plain `Error`s.
 */
export type HostError =
  | { tag: "denied"; val: string }
  | { tag: "unavailable"; val: string }
  | { tag: "no-such-session"; val: number }
  | { tag: "failed"; val: HostFailure };

/** Which inspector a session attaches to, mirroring the WIT `connect-kind` enum. */
export type HostConnectKind = "local" | "main-thread";

/** Which experimental broadcast namespace an `emit` targets, mirroring `broadcast-target`. */
export type HostBroadcastTarget = "network" | "dom-storage";

/**
 * A synchronously-resolved CDP response, mirroring the WIT `command-response` variant.
 *
 * `sessionPost` returns `undefined` (the WIT `none`) when the response is deferred instead.
 */
export type HostCommandResponse =
  | { tag: "ok"; val: string | undefined }
  | { tag: "failed"; val: HostFailure };

/**
 * The host boundary the inspector shim forwards to.
 *
 * Every method matches a function in the `jco:node/inspector@0.1.0` WIT interface. Callback ids are
 * `u32`s the guest allocates before the call; the host redeems them through the exported callbacks
 * interface (see `callbacks.ts`).
 */
export interface InspectorHost {
  open(port: number | undefined, host: string | undefined, wait: boolean): void;
  close(): void;
  url(): string | undefined;
  waitForDebugger(): void;
  consoleCall(context: string | undefined, method: string, argsJson: string): void;
  sessionConnect(session: number, kind: HostConnectKind, listener: number): void;
  sessionPost(
    session: number,
    method: string,
    paramsJson: string | undefined,
    callback: number | undefined,
  ): HostCommandResponse | undefined;
  sessionDisconnect(session: number): void;
  emit(target: HostBroadcastTarget, event: string, paramsJson: string): void;
  putNetworkResource(url: string, data: string): void;
}
