export { default as ipNameLookup } from "./sockets/ip-name-lookup.js";
export { default as types } from "./sockets/types.js";
export { _setTcpProvider, _setUdpProvider } from "./sockets/types.js";
export {
  InMemoryTcpClient,
  InMemoryTcpSockets,
  InMemoryUdpClient,
  InMemoryUdpSockets,
} from "@bytecodealliance/preview2-shim/sockets";
