import { describe, expect, test } from "vitest";
import nodeDgram from "node:dgram";
import { EventEmitter } from "node:events";
import { setup } from "./helpers/setup.js";
import { createDgram } from "../../../../../../src/wasi/0.2.x/node/24.x.x/dgram/core.js";
import denied from "../../../../../../src/wasi/0.2.x/node/24.x.x/dgram-host.js";

describe("node:dgram module", () => {
  test.skipIf(!process.versions.node.startsWith("24."))(
    "matches pinned Node module/prototype shape and identities",
    () => {
      expect(process.versions.node.split(".")[0]).toBe("24");
      const dgram = setup();
      expect(Object.keys(dgram).sort()).toEqual(Object.keys(nodeDgram).sort());
      expect(Reflect.ownKeys(dgram.Socket.prototype).map(String).sort()).toEqual(
        Reflect.ownKeys(nodeDgram.Socket.prototype).map(String).sort(),
      );
      for (const key of Reflect.ownKeys(nodeDgram.Socket.prototype)) {
        const expected = Object.getOwnPropertyDescriptor(nodeDgram.Socket.prototype, key)!;
        const actual = Object.getOwnPropertyDescriptor(dgram.Socket.prototype, key)!;
        expect({
          enumerable: actual.enumerable,
          configurable: actual.configurable,
          writable: actual.writable,
        }).toEqual({
          enumerable: expected.enumerable,
          configurable: expected.configurable,
          writable: expected.writable,
        });
      }
      const socket = dgram.createSocket("udp4");
      expect(socket).toBeInstanceOf(dgram.Socket);
      expect(socket).toBeInstanceOf(EventEmitter);
      expect(socket.type).toBe("udp4");
      socket.close();
    },
  );
  test("imports, constructs, refs and closes without granting networking", () => {
    const { dgram } = createDgram(denied);
    const socket = dgram.createSocket("udp4");
    expect(socket.ref().unref()).toBe(socket);
    expect(() => socket.bind(0)).toThrow(/node:dgram/);
    expect(() => socket.bind(0)).toThrow(
      expect.objectContaining({ code: "ERR_JCO_DGRAM_ADAPTER_REQUIRED" }),
    );
    socket.close();
  });
});
