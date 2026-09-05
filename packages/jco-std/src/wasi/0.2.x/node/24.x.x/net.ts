import * as instanceNetwork from "wasi:sockets/instance-network@0.2.12";
import * as ipNameLookup from "wasi:sockets/ip-name-lookup@0.2.12";
import * as tcpCreateSocket from "wasi:sockets/tcp-create-socket@0.2.12";

import { createNet } from "./net/core.js";

const net = createNet({ instanceNetwork, ipNameLookup, tcpCreateSocket });

export type * from "./net/types.js";
export type Socket = import("./net/socket.js").SocketBase;
export type Server = import("./net/server.js").ServerBase;
export type BoundSocket = import("./net/bound-socket.js").BoundSocketBase;
export type SocketAddress = import("./net/socket-address.js").SocketAddress;
export type BlockList = import("./net/block-list.js").BlockList;
export const {
  BlockList,
  BoundSocket,
  Server,
  Socket,
  SocketAddress,
  Stream,
  _createServerHandle,
  _normalizeArgs,
  connect,
  createConnection,
  createServer,
  getDefaultAutoSelectFamily,
  getDefaultAutoSelectFamilyAttemptTimeout,
  isIP,
  isIPv4,
  isIPv6,
  setDefaultAutoSelectFamily,
  setDefaultAutoSelectFamilyAttemptTimeout,
} = net;

export default net;
