import { createDgram } from "../../../../../../../src/wasi/0.2.x/node/24.x.x/dgram/core.js";
import { createDgramHost } from "../../../../../../../src/wasi/0.2.x/node/24.x.x/dgram-host-node.js";
import type { Socket } from "../../../../../../../src/wasi/0.2.x/node/24.x.x/dgram/types.js";

export function setup() {
  const result = createDgram(createDgramHost(() => result.dgramCallbacks));
  return result.dgram;
}

export function event(socket: Socket, name: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    socket.once(name, (...args: unknown[]) => {
      socket.off("error", reject);
      resolve(args);
    });
    socket.once("error", reject);
  });
}

export function errorShape(call: () => unknown) {
  try {
    call();
    return undefined;
  } catch (error) {
    const value = error as Error & { code?: string };
    return { name: value.name, code: value.code, message: value.message };
  }
}
