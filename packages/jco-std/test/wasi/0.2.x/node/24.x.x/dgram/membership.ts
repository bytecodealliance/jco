import { expect, test } from "vitest";
import { setup } from "./helpers/setup.js";

test("joins and leaves multicast memberships on loopback", () => {
  const socket = setup().createSocket({ type: "udp4", reuseAddr: true });
  try {
    socket.bindSync({ address: "0.0.0.0" });
    expect(socket.addMembership("239.255.42.1", "127.0.0.1")).toBeUndefined();
    expect(socket.dropMembership("239.255.42.1", "127.0.0.1")).toBeUndefined();
    expect(socket.setMulticastInterface("127.0.0.1")).toBeUndefined();
    // Source-specific memberships are supported on this Node/Linux test host.
    if (process.platform === "linux") {
      expect(
        socket.addSourceSpecificMembership("127.0.0.1", "239.255.42.2", "127.0.0.1"),
      ).toBeUndefined();
      expect(
        socket.dropSourceSpecificMembership("127.0.0.1", "239.255.42.2", "127.0.0.1"),
      ).toBeUndefined();
    }
  } finally {
    socket.close();
  }
});
