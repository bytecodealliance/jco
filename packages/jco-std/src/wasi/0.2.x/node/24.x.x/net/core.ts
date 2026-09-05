/**
 * Portable core for `node:net`.
 *
 * The export surface, aliases, factories, and overload normalization follow nodejs/node v24.19.0,
 * commit cdc1b38d40cb567b7ad0b39c86addf830a0af0ae, lib/net.js (MIT license).
 */

import type { WasiSocketsProvider } from "../internal/wasi-sockets.js";
import { BlockList } from "./block-list.js";
import { createBoundSocketConstructor, type BoundSocketConstructor } from "./bound-socket.js";
import {
  getDefaultAutoSelectFamily,
  getDefaultAutoSelectFamilyAttemptTimeout,
  setDefaultAutoSelectFamily,
  setDefaultAutoSelectFamilyAttemptTimeout,
} from "./defaults.js";
import { unsupported } from "./errors.js";
import { isIP, isIPv4, isIPv6 } from "./ip.js";
import { normalizeArgs, type NormalizedArgs } from "./normalize.js";
import {
  createServerConstructor,
  type ConnectionListener,
  type ServerBase,
  type ServerConstructor,
} from "./server.js";
import { createSocketConstructor, type SocketBase, type SocketConstructor } from "./socket.js";
import { SocketAddress } from "./socket-address.js";
import type { NetCallback, ServerOptions, SocketConnectOptions } from "./types.js";

export interface CreateConnection {
  (options: SocketConnectOptions, connectionListener?: NetCallback): SocketBase;
  (port: number, host?: string | NetCallback, connectionListener?: NetCallback): SocketBase;
  (path: string, connectionListener?: NetCallback): SocketBase;
}

export interface CreateServer {
  (connectionListener?: ConnectionListener): ServerBase;
  (options?: ServerOptions | null, connectionListener?: ConnectionListener): ServerBase;
}

export interface NodeNetModule {
  BlockList: typeof BlockList;
  BoundSocket: BoundSocketConstructor;
  Server: ServerConstructor;
  Socket: SocketConstructor;
  SocketAddress: typeof SocketAddress;
  Stream: SocketConstructor;
  _createServerHandle: (...args: unknown[]) => never;
  _normalizeArgs: (args: readonly unknown[]) => NormalizedArgs;
  connect: CreateConnection;
  createConnection: CreateConnection;
  createServer: CreateServer;
  getDefaultAutoSelectFamily: typeof getDefaultAutoSelectFamily;
  getDefaultAutoSelectFamilyAttemptTimeout: typeof getDefaultAutoSelectFamilyAttemptTimeout;
  isIP: typeof isIP;
  isIPv4: typeof isIPv4;
  isIPv6: typeof isIPv6;
  setDefaultAutoSelectFamily: typeof setDefaultAutoSelectFamily;
  setDefaultAutoSelectFamilyAttemptTimeout: typeof setDefaultAutoSelectFamilyAttemptTimeout;
}

export function createNet(provider: WasiSocketsProvider): NodeNetModule {
  const BoundSocket = createBoundSocketConstructor(provider);
  const Socket = createSocketConstructor(provider);
  const Server = createServerConstructor(provider, Socket);

  const createConnection = ((...args: unknown[]): SocketBase => {
    const normalized = normalizeArgs(args);
    const socket = new Socket(normalized[0] as unknown as SocketConnectOptions);
    return (socket.connect as (...values: unknown[]) => SocketBase).call(socket, normalized);
  }) as CreateConnection;
  const connect = createConnection;

  const createServer = ((
    optionsOrListener?: ServerOptions | ConnectionListener | null,
    listener?: ConnectionListener,
  ): ServerBase => new Server(optionsOrListener, listener)) as CreateServer;

  function _createServerHandle(..._args: unknown[]): never {
    return unsupported(
      "net._createServerHandle",
      "components cannot create or expose Node/libuv server handles",
    );
  }

  function _normalizeArgs(args: readonly unknown[]): NormalizedArgs {
    return normalizeArgs(args);
  }

  return {
    BlockList,
    BoundSocket,
    Server,
    Socket,
    SocketAddress,
    Stream: Socket,
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
  };
}
