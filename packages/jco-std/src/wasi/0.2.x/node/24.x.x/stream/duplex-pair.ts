/**
 * Adapted from nodejs/node v24.20.0, commit
 * 71b8b174857e25106d39b61a9e6f30d927da8b01,
 * lib/internal/streams/duplexpair.js (MIT).
 * Local changes add types and use the portable core and guest scheduler.
 */
import { core } from "./core.js";
import { nextTick } from "./scheduler.js";
import type { Callback, Duplex, DuplexOptions } from "./types.js";

class DuplexSide extends core.Duplex {
  otherSide!: DuplexSide;
  pendingRead: Callback | null = null;

  _read(): void {
    const callback = this.pendingRead;
    if (callback) {
      this.pendingRead = null;
      callback();
    }
  }

  _write(chunk: unknown, _encoding: string, callback: Callback): void {
    if (ArrayBuffer.isView(chunk) && chunk.byteLength === 0) {
      nextTick(callback);
    } else {
      this.otherSide.push(chunk);
      this.otherSide.pendingRead = callback;
    }
  }

  _final(callback: Callback): void {
    this.otherSide.on("end", callback);
    this.otherSide.push(null);
  }

  _destroy(error: Error | null, callback: Callback): void {
    const other = this.otherSide;
    if (other && !other.destroyed) {
      nextTick((): void => {
        if (other.destroyed) {
          return;
        }
        if (error) {
          other.destroy();
        } else {
          other.push(null);
        }
      });
    }
    callback(error);
  }
}

export function duplexPair(options?: DuplexOptions): [Duplex, Duplex] {
  const first = new DuplexSide(options);
  const second = new DuplexSide(options);
  first.otherSide = second;
  second.otherSide = first;
  return [first, second];
}
