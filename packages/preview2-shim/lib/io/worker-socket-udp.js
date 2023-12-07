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
export function createUdpSocket(addressFamily) {
  return new Promise((resolve, reject) => {
    const type = addressFamily === "ipv4" ? "udp4" : "udp6";
    try {
      const socket = createSocket(type);
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
