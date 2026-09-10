import { expect, test } from "vitest";
import nodeDgram from "node:dgram";
import { setup, errorShape } from "./helpers/setup.js";

test.skipIf(!process.versions.node.startsWith("24."))(
  "createSocket validates options against Node 24",
  () => {
    const dgram = setup();
    const options: unknown[] = [
      null,
      undefined,
      "tcp",
      {},
      { type: "udp" },
      { type: "udp4", lookup: 1 },
    ];
    for (const field of ["recvBufferSize", "sendBufferSize"]) {
      for (const value of [-1, 1.5, Infinity, 2 ** 32, "1", true]) {
        options.push({ type: "udp4", [field]: value });
      }
    }
    for (const option of options) {
      expect(errorShape(() => Reflect.apply(dgram.createSocket, dgram, [option]))).toEqual(
        errorShape(() => Reflect.apply(nodeDgram.createSocket, nodeDgram, [option])),
      );
    }
  },
);

test("unknown option getters are not evaluated", () => {
  const socket = setup().createSocket({
    type: "udp4",
    get unused() {
      throw Error("unknown option read");
    },
  } as { type: "udp4" });
  socket.close();
});
