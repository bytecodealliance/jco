import { WasiSockets, denyDnsLookup, denyTcp, denyUdp } from "./sockets/wasi-sockets.js";

export function _denyDnsLookup() {
  denyDnsLookup(sockets);
}

export function _denyTcp() {
  denyTcp(sockets);
}

export function _denyUdp() {
  denyUdp(sockets);
}

const sockets = new WasiSockets();

export const {
  ipNameLookup,
  instanceNetwork,
  network,
  tcpCreateSocket,
  udpCreateSocket,
  tcp,
  udp,
} = sockets;
