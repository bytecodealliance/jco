import { expect, test } from "vitest";
import nodeDgram from "node:dgram";
import { setup, errorShape } from "./helpers/setup.js";

test.skipIf(!process.versions.node.startsWith("24."))(
  "socket options and multicast validation follow Node",
  () => {
    const socket = setup().createSocket("udp4");
    const native = nodeDgram.createSocket("udp4");
    socket.bindSync({ address: "127.0.0.1" });
    (native as unknown as typeof socket).bindSync({ address: "127.0.0.1" });
    try {
      expect(socket.setTTL(32)).toBe(32);
      expect(socket.setMulticastTTL(8)).toBe(8);
      expect(socket.setMulticastLoopback(false)).toBe(false);
      expect(socket.setBroadcast(true)).toBeUndefined();
      socket.setRecvBufferSize(65536);
      socket.setSendBufferSize(65536);
      expect(socket.getRecvBufferSize()).toBeGreaterThanOrEqual(65536);
      expect(socket.getSendBufferSize()).toBeGreaterThanOrEqual(65536);
      expect(socket.getSendQueueSize()).toBe(0);
      expect(socket.getSendQueueCount()).toBe(0);
      expect(socket.ref().unref().ref()).toBe(socket);
      for (const operation of [
        (s: typeof socket) => s.setTTL(0),
        (s: typeof socket) => s.setTTL(256),
        (s: typeof socket) => s.setMulticastInterface("invalid"),
        (s: typeof socket) => s.addMembership("invalid"),
        (s: typeof socket) => s.dropMembership("invalid"),
        (s: typeof socket) => s.addSourceSpecificMembership("invalid", "239.1.1.1"),
        (s: typeof socket) => s.dropSourceSpecificMembership("invalid", "239.1.1.1"),
      ]) {
        expect(errorShape(() => operation(socket))).toEqual(
          errorShape(() => operation(native as unknown as typeof socket)),
        );
      }
    } finally {
      socket.close();
      native.close();
    }
  },
);

test.skipIf(!process.versions.node.startsWith("24."))(
  "buffer failures retain SystemError fields and linked errno/syscall",
  () => {
    const socket = setup().createSocket("udp4");
    const native = nodeDgram.createSocket("udp4");
    try {
      for (const operation of [
        (s: typeof socket) => s.address(),
        (s: typeof socket) => s.getRecvBufferSize(),
        (s: typeof socket) => s.getSendBufferSize(),
      ]) {
        expect(errorShape(() => operation(socket))).toEqual(
          errorShape(() => operation(native as unknown as typeof socket)),
        );
      }
      let error: unknown;
      try {
        socket.getRecvBufferSize();
      } catch (caught) {
        error = caught;
      }
      expect(error).toMatchObject({
        name: "SystemError",
        code: "ERR_SOCKET_BUFFER_SIZE",
        info: { code: "EBADF", syscall: "uv_recv_buffer_size" },
      });
      Reflect.set(error as object, "errno", 100);
      expect(Reflect.get(error as object, "info").errno).toBe(100);
    } finally {
      socket.close();
      native.close();
    }
  },
);
