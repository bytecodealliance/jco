/*
 * @typedef {import("../../types/interfaces/wasi-sockets-network").IpAddressFamily} IpAddressFamily
 */
import { createSocket } from "node:dgram";
import { unfinishedSockets } from "./worker-thread.js";

let socketCnt = 0;

/**
 * @param {IpAddressFamily} addressFamily
 * @returns {NodeJS.Socket}
 */
export function createUdpSocket(addressFamily, reuseAddr) {
  return new Promise((resolve, reject) => {
    const type = addressFamily === "ipv6" ? "udp6" : "udp4";
    try {
      const socket = createSocket({
        type,
        reuseAddr,
      });
      unfinishedSockets.set(++socketCnt, socket);
      resolve({
        id: socketCnt,
        socket,
      });
    } catch (e) {
      reject(e);
    }
  });
}
