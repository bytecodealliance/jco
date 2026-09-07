/** Low-level integration with the shared Node IO worker for opt-in host providers. */
import * as io from "../io/worker-io.js";
import {
    WORKER_EXTENSION_CALL,
    SOCKET_TCP,
    FUTURE_TAKE_VALUE,
    FUTURE_SUBSCRIBE,
    FUTURE_DISPOSE,
} from "../io/calls.js";
import type { InputStream, OutputStream } from "../../types/interfaces/wasi-io-streams.js";
import type { Pollable } from "../../types/interfaces/wasi-io-poll.js";
import type { Error as IoError } from "../../types/interfaces/wasi-io-error.js";
export type { WorkerExtension, WorkerExtensionContext } from "../io/extension.js";

export type FutureResult<T, E> =
    | { tag: "err"; val?: undefined }
    | { tag: "ok"; val: { tag: "ok"; val: T } | { tag: "err"; val: E } }
    | undefined;

/** Loads a host-selected module once in the existing worker; never accepts a guest module path. */
export function callExtension(module: URL, operation: string, args: unknown[]): unknown {
    return io.ioCall(WORKER_EXTENSION_CALL, null, { module: module.href, operation, args });
}
export function inputStreamId(stream: InputStream): number {
    return io.inputStreamId(stream);
}
export function outputStreamId(stream: OutputStream): number {
    return io.outputStreamId(stream);
}
export function inputStreamCreate(id: number): InputStream {
    return io.inputStreamCreate(SOCKET_TCP, id);
}
export function outputStreamCreate(id: number): OutputStream {
    return io.outputStreamCreate(SOCKET_TCP, id);
}
export function futureSubscribe(id: number, parent: object): Pollable {
    return io.pollableCreate(io.ioCall(FUTURE_SUBSCRIBE, id, undefined), parent);
}
/** T and E are the promise's value and rejection types chosen by the host extension. */
export function futureTakeValue<T, E>(id: number): FutureResult<T, E> {
    return io.ioCall(FUTURE_TAKE_VALUE, id, undefined);
}
export function futureDispose(id: number): void {
    io.ioCall(FUTURE_DISPOSE, id, undefined);
}
export function createIoError(message: string): IoError {
    return new io.error.Error(message);
}
