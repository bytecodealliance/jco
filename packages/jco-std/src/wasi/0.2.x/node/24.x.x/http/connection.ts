import { Duplex } from "node:stream";
import { Buffer } from "node:buffer";
import type { HttpConnection, HttpSocketEvent } from "./types.js";
import { callHost } from "../internal/host-error.js";
import { fromImplementationError } from "./errors.js";

const sockets = new Map<number, ConnectionSocket>();

/** Node duplex stream over an explicitly supplied HTTP connection resource. */
export class ConnectionSocket extends Duplex {
  readonly remoteAddress?: string;
  readonly remotePort?: number;
  readonly encrypted = false;
  connecting = false;
  #closedByHost = false;
  #released = false;
  constructor(
    readonly connection: HttpConnection,
    address?: string,
    port?: number,
  ) {
    super();
    this.remoteAddress = address;
    this.remotePort = port;
    sockets.set(connection.id(), this);
  }
  _read(): void {
    this.connection.resume();
  }
  _write(chunk: Buffer, _encoding: string, done: (error?: Error | null) => void): void {
    try {
      callHost(() => this.connection.write(chunk), fromImplementationError);
      done();
    } catch (error) {
      done(error as Error);
    }
  }
  _final(done: (error?: Error | null) => void): void {
    this.connection.end();
    done();
  }
  _destroy(error: Error | null, done: (error?: Error | null) => void): void {
    if (this.#released) {
      done(error);
      return;
    }
    sockets.delete(this.connection.id());
    if (!this.#closedByHost) {
      this.connection.destroy();
    }
    this.connection[Symbol.dispose]();
    this.#released = true;
    done(error);
  }
  /** Release a borrowed HTTP socket without closing the host's keep-alive transport. */
  release(): void {
    if (this.#released) {
      return;
    }
    sockets.delete(this.connection.id());
    this.connection[Symbol.dispose]();
    this.#released = true;
  }
  setTimeout(milliseconds: number, callback?: () => void): this {
    this.connection.setTimeout(milliseconds);
    if (callback) {
      this.once("timeout", callback);
    }
    return this;
  }
  setNoDelay(value = true): this {
    this.connection.setNoDelay(value);
    return this;
  }
  setKeepAlive(value = false, delay = 0): this {
    this.connection.setKeepAlive(value, delay);
    return this;
  }
  pause(): this {
    this.connection.pause();
    return super.pause();
  }
  resume(): this {
    this.connection.resume();
    return super.resume();
  }
  ref(): this {
    this.connection.ref();
    return this;
  }
  unref(): this {
    this.connection.unref();
    return this;
  }
  dispatch(event: HttpSocketEvent): void {
    if (event.tag === "data") {
      if (!this.push(Buffer.from(event.val))) {
        this.connection.pause();
      }
    } else if (event.tag === "end") {
      this.push(null);
    } else if (event.tag === "timeout") {
      this.emit("timeout");
    } else if (event.tag === "drain") {
      this.emit("drain");
    } else if (event.tag === "error") {
      this.destroy(fromImplementationError(event.val));
    } else {
      this.#closedByHost = true;
      this.destroy();
    }
  }
}
export function dispatchSocketEvent(id: number, event: HttpSocketEvent): void {
  sockets.get(id)?.dispatch(event);
}
