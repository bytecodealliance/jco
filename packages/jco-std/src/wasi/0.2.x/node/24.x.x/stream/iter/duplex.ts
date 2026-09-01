/**
 * Iterable-stream duplex pairs.
 *
 * Adapted from nodejs/node v24.20.0, commit
 * 71b8b174857e25106d39b61a9e6f30d927da8b01,
 * lib/internal/streams/iter/duplex.js (MIT license). Local changes compose the
 * portable push implementation directly.
 */

import { invalidArgType } from "../../errors/core.js";
import { validateAbortSignal } from "../shared.js";
import { createPush } from "./push.js";
import type { DuplexChannel, DuplexOptions, Writer } from "./types.js";

class PortableDuplexChannel implements DuplexChannel {
  constructor(
    readonly writer: Writer,
    readonly readable: AsyncIterable<Uint8Array[]>,
  ) {}

  async close(): Promise<void> {
    await this.writer.end();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }
}

export function duplex(options: DuplexOptions = {}): [DuplexChannel, DuplexChannel] {
  if (options === null || typeof options !== "object") {
    throw invalidArgType("options", "Object", options);
  }
  validateAbortSignal(options.signal);
  const common = {
    budget: options.budget,
    backpressure: options.backpressure,
    signal: options.signal,
  };
  const aToB = createPush({ ...common, ...options.a });
  const bToA = createPush({ ...common, ...options.b });
  return [
    new PortableDuplexChannel(aToB.writer, bToA.readable),
    new PortableDuplexChannel(bToA.writer, aToB.readable),
  ];
}
