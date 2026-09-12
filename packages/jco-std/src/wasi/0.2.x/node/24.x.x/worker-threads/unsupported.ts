import { unsupportedNodeApi } from "../errors/core.js";

export function unsupported(api: string): never {
  throw unsupportedNodeApi(
    api,
    "Native message ports, shared memory, contexts and locks cannot cross the worker_threads component boundary",
  );
}

/** No disconnected or inert ports are returned when native messaging is unavailable. */
export class MessagePort {
  constructor() {
    unsupported("new MessagePort()");
  }

  postMessage(_value: unknown, _transferList?: readonly object[]): never {
    return unsupported("MessagePort.postMessage()");
  }

  start(): never {
    return unsupported("MessagePort.start()");
  }

  close(_callback?: () => void): never {
    return unsupported("MessagePort.close()");
  }

  ref(): never {
    return unsupported("MessagePort.ref()");
  }

  unref(): never {
    return unsupported("MessagePort.unref()");
  }

  hasRef(): never {
    return unsupported("MessagePort.hasRef()");
  }

  get onmessage(): never {
    return unsupported("MessagePort.onmessage");
  }

  set onmessage(_value: unknown) {
    unsupported("MessagePort.onmessage");
  }

  get onmessageerror(): never {
    return unsupported("MessagePort.onmessageerror");
  }

  set onmessageerror(_value: unknown) {
    unsupported("MessagePort.onmessageerror");
  }
}

export class MessageChannel {
  declare readonly port1: MessagePort;
  declare readonly port2: MessagePort;
  constructor() {
    unsupported("new MessageChannel()");
  }
}

export class BroadcastChannel {
  constructor(_name: string) {
    unsupported("new BroadcastChannel()");
  }

  get name(): never {
    return unsupported("BroadcastChannel.name");
  }

  close(): never {
    return unsupported("BroadcastChannel.close()");
  }

  postMessage(_value: unknown): never {
    return unsupported("BroadcastChannel.postMessage()");
  }

  ref(): never {
    return unsupported("BroadcastChannel.ref()");
  }

  unref(): never {
    return unsupported("BroadcastChannel.unref()");
  }

  get onmessage(): never {
    return unsupported("BroadcastChannel.onmessage");
  }

  set onmessage(_value: unknown) {
    unsupported("BroadcastChannel.onmessage");
  }

  get onmessageerror(): never {
    return unsupported("BroadcastChannel.onmessageerror");
  }

  set onmessageerror(_value: unknown) {
    unsupported("BroadcastChannel.onmessageerror");
  }
}

export function receiveMessageOnPort(_port: MessagePort | BroadcastChannel): never {
  return unsupported("worker_threads.receiveMessageOnPort()");
}
export function moveMessagePortToContext(_port: MessagePort, _context: object): never {
  return unsupported("worker_threads.moveMessagePortToContext()");
}
export function postMessageToThread(
  _id: number,
  _value: unknown,
  _transferListOrTimeout?: readonly object[] | number,
  _timeout?: number,
): never {
  return unsupported("worker_threads.postMessageToThread()");
}

export interface Lock {
  readonly name: string;
  readonly mode: "exclusive" | "shared";
}
export interface LockOptions {
  mode?: "exclusive" | "shared";
  ifAvailable?: boolean;
  steal?: boolean;
  signal?: AbortSignal;
}
export interface LockInfo extends Lock {
  readonly clientId: string;
}
export interface LockManagerSnapshot {
  held: LockInfo[];
  pending: LockInfo[];
}
class LockManager {
  request<T>(
    _name: string,
    _optionsOrCallback: LockOptions | ((lock: Lock | null) => T | PromiseLike<T>),
    _callback?: (lock: Lock | null) => T | PromiseLike<T>,
  ): Promise<T> {
    return unsupported("worker_threads.locks.request()");
  }

  query(): Promise<LockManagerSnapshot> {
    return unsupported("worker_threads.locks.query()");
  }
}
export const locks = new LockManager();
