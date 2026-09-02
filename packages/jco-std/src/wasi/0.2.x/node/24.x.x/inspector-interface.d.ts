import type {
  HostBroadcastTarget,
  HostCommandResponse,
  HostConnectKind,
} from "./inspector/types.js";

export function open(port: number | undefined, host: string | undefined, wait: boolean): void;
export function close(): void;
export function url(): string | undefined;
export function waitForDebugger(): void;
export function consoleCall(context: string | undefined, method: string, argsJson: string): void;
export function sessionConnect(session: number, kind: HostConnectKind, listener: number): void;
export function sessionPost(
  session: number,
  method: string,
  paramsJson: string | undefined,
  callback: number | undefined,
): HostCommandResponse | undefined;
export function sessionDisconnect(session: number): void;
export function emit(target: HostBroadcastTarget, event: string, paramsJson: string): void;
export function putNetworkResource(url: string, data: string): void;
