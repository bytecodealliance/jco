/** IO-worker integration for opt-in host providers. No capability is installed by importing this module. */
import type { Readable, Writable } from "node:stream";
export interface WorkerExtensionContext {
    createFuture(promise: Promise<void>): number;
    createReadableStream(stream: Readable): number;
    createWritableStream(stream: Writable): number;
    getStream(id: number): unknown;
    resourceCounts(): { streams: number; futures: number; polls: number; sockets: number };
}
export type WorkerExtension = (operation: string, args: unknown[]) => unknown | Promise<unknown>;
