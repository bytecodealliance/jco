import * as preview2Sockets from "@bytecodealliance/preview2-shim/sockets";
import type {
  Duration,
  ErrorCode,
  IpAddressFamily,
  IpSocketAddress,
  Result,
  TcpSocket as TcpSocketT,
  UdpSocket as UdpSocketT,
} from "../../../types/interfaces/wasi-sockets-types.d.ts";
import { readableFromPreview2Input, writeToPreview2Output } from "../streams.js";

type TcpProvider = {
  tcp: typeof preview2Sockets.tcp;
  tcpCreateSocket: typeof preview2Sockets.tcpCreateSocket;
};
type UdpProvider = {
  udp: typeof preview2Sockets.udp;
  udpCreateSocket: typeof preview2Sockets.udpCreateSocket;
};

let tcpProvider: TcpProvider = preview2Sockets;
let udpProvider: UdpProvider = preview2Sockets;

class SocketError extends Error {
  readonly payload: ErrorCode;

  constructor(payload: ErrorCode) {
    super(payload.tag);
    this.name = "SocketError";
    this.payload = payload;
  }
}

export function socketErrorCode(error: unknown): ErrorCode {
  let tag = typeof error === "string" ? error : (error as { tag?: string })?.tag;
  if (!tag && error instanceof Error) {
    tag = error.message;
  }
  if (tag === "would-block" || tag === "not-in-progress") {
    return { tag: "invalid-state" };
  }
  if (tag) {
    return { tag } as ErrorCode;
  }
  return { tag: "other", val: String(error) };
}

function socketError(error: unknown): never {
  throw error instanceof SocketError ? error : new SocketError(socketErrorCode(error));
}

function socketCall<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    socketError(error);
  }
}

export function _setTcpProvider(provider: TcpProvider): TcpProvider {
  const previous = tcpProvider;
  tcpProvider = provider;
  return previous;
}

export function _setUdpProvider(provider: UdpProvider): UdpProvider {
  const previous = udpProvider;
  udpProvider = provider;
  return previous;
}

export class TcpSocket implements TcpSocketT {
  #socket: any;
  #input: any;
  #output: any;

  static create(addressFamily: IpAddressFamily): TcpSocket {
    try {
      return TcpSocket._wrap(tcpProvider.tcpCreateSocket.createTcpSocket(addressFamily));
    } catch (error) {
      socketError(error);
    }
  }

  static _wrap(socket: unknown, input?: unknown, output?: unknown): TcpSocket {
    const wrapped = new TcpSocket();
    wrapped.#socket = socket;
    wrapped.#input = input;
    wrapped.#output = output;
    return wrapped;
  }

  bind(localAddress: IpSocketAddress): void {
    try {
      this.#socket.startBind({}, localAddress);
      this.#socket.finishBind();
    } catch (error) {
      socketError(error);
    }
  }

  async connect(remoteAddress: IpSocketAddress): Promise<void> {
    try {
      this.#socket.startConnect({}, remoteAddress);
      const connected = this.#socket.finishConnect();
      if (Array.isArray(connected)) {
        [this.#input, this.#output] = connected;
      }
    } catch (error) {
      socketError(error);
    }
  }

  listen(): ReadableStream<TcpSocketT> {
    try {
      this.#socket.startListen();
      this.#socket.finishListen();
    } catch (error) {
      socketError(error);
    }
    return new ReadableStream<TcpSocketT>({
      pull: async (controller) => {
        while (true) {
          try {
            const [socket, input, output] = this.#socket.accept();
            controller.enqueue(TcpSocket._wrap(socket, input, output));
            return;
          } catch (error) {
            if (error === "would-block") {
              await new Promise((resolve) => setTimeout(resolve, 0));
              continue;
            }
            controller.error(new SocketError(socketErrorCode(error)));
            return;
          }
        }
      },
    });
  }

  async send(data: ReadableStream<number>): Promise<Result<void, ErrorCode>> {
    if (!this.#output) {
      return { tag: "err", val: { tag: "invalid-state" } };
    }
    try {
      await writeToPreview2Output(data, this.#output);
      return { tag: "ok", val: undefined };
    } catch (error) {
      return { tag: "err", val: socketErrorCode(error) };
    }
  }

  receive(): [ReadableStream<number>, Promise<Result<void, ErrorCode>>] {
    if (!this.#input) {
      const error = { tag: "invalid-state" } as ErrorCode;
      const stream = new ReadableStream<number>({
        start(controller) {
          controller.error(new SocketError(error));
        },
      });
      return [stream, Promise.resolve({ tag: "err", val: error })];
    }
    return readableFromPreview2Input(this.#input, socketErrorCode);
  }

  getLocalAddress(): IpSocketAddress {
    try {
      return this.#socket.localAddress();
    } catch (error) {
      socketError(error);
    }
  }

  getRemoteAddress(): IpSocketAddress {
    try {
      return this.#socket.remoteAddress();
    } catch (error) {
      socketError(error);
    }
  }

  getIsListening(): boolean {
    return socketCall(() => this.#socket.isListening());
  }

  getAddressFamily(): IpAddressFamily {
    return socketCall(() => this.#socket.addressFamily());
  }

  setListenBacklogSize(value: bigint): void {
    socketCall(() => this.#socket.setListenBacklogSize(value));
  }

  getKeepAliveEnabled(): boolean {
    return socketCall(() => this.#socket.keepAliveEnabled());
  }

  setKeepAliveEnabled(value: boolean): void {
    socketCall(() => this.#socket.setKeepAliveEnabled(value));
  }

  getKeepAliveIdleTime(): Duration {
    return socketCall(() => this.#socket.keepAliveIdleTime());
  }

  setKeepAliveIdleTime(value: Duration): void {
    socketCall(() => this.#socket.setKeepAliveIdleTime(value));
  }

  getKeepAliveInterval(): Duration {
    return socketCall(() => this.#socket.keepAliveInterval());
  }

  setKeepAliveInterval(value: Duration): void {
    socketCall(() => this.#socket.setKeepAliveInterval(value));
  }

  getKeepAliveCount(): number {
    return socketCall(() => this.#socket.keepAliveCount());
  }

  setKeepAliveCount(value: number): void {
    socketCall(() => this.#socket.setKeepAliveCount(value));
  }

  getHopLimit(): number {
    return socketCall(() => this.#socket.hopLimit());
  }

  setHopLimit(value: number): void {
    socketCall(() => this.#socket.setHopLimit(value));
  }

  getReceiveBufferSize(): bigint {
    return socketCall(() => this.#socket.receiveBufferSize());
  }

  setReceiveBufferSize(value: bigint): void {
    socketCall(() => this.#socket.setReceiveBufferSize(value));
  }

  getSendBufferSize(): bigint {
    return socketCall(() => this.#socket.sendBufferSize());
  }

  setSendBufferSize(value: bigint): void {
    socketCall(() => this.#socket.setSendBufferSize(value));
  }
}

export class UdpSocket implements UdpSocketT {
  #socket: any;
  #incoming: any;
  #outgoing: any;

  static create(addressFamily: IpAddressFamily): UdpSocket {
    try {
      const wrapped = new UdpSocket();
      wrapped.#socket = udpProvider.udpCreateSocket.createUdpSocket(addressFamily);
      return wrapped;
    } catch (error) {
      socketError(error);
    }
  }

  bind(localAddress: IpSocketAddress): void {
    try {
      this.#socket.startBind({}, localAddress);
      this.#socket.finishBind();
    } catch (error) {
      socketError(error);
    }
  }

  connect(remoteAddress: IpSocketAddress): void {
    try {
      [this.#incoming, this.#outgoing] = this.#socket.stream(remoteAddress);
    } catch (error) {
      socketError(error);
    }
  }

  disconnect(): void {
    try {
      [this.#incoming, this.#outgoing] = this.#socket.stream(undefined);
    } catch (error) {
      socketError(error);
    }
  }

  async send(data: Uint8Array, remoteAddress: IpSocketAddress | undefined): Promise<void> {
    try {
      if (!this.#outgoing) {
        [this.#incoming, this.#outgoing] = this.#socket.stream(remoteAddress);
      }
      this.#outgoing.checkSend();
      this.#outgoing.send([{ data, remoteAddress }]);
    } catch (error) {
      socketError(error);
    }
  }

  async receive(): Promise<[Uint8Array, IpSocketAddress]> {
    if (!this.#incoming) {
      try {
        [this.#incoming, this.#outgoing] = this.#socket.stream(undefined);
      } catch (error) {
        socketError(error);
      }
    }
    while (true) {
      try {
        const [datagram] = this.#incoming.receive(1n);
        if (datagram) {
          return [datagram.data, datagram.remoteAddress];
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      } catch (error) {
        socketError(error);
      }
    }
  }

  getLocalAddress(): IpSocketAddress {
    try {
      return this.#socket.localAddress();
    } catch (error) {
      socketError(error);
    }
  }

  getRemoteAddress(): IpSocketAddress {
    try {
      return this.#socket.remoteAddress();
    } catch (error) {
      socketError(error);
    }
  }

  getAddressFamily(): IpAddressFamily {
    return socketCall(() => this.#socket.addressFamily());
  }

  getUnicastHopLimit(): number {
    return socketCall(() => this.#socket.unicastHopLimit());
  }

  setUnicastHopLimit(value: number): void {
    socketCall(() => this.#socket.setUnicastHopLimit(value));
  }

  getReceiveBufferSize(): bigint {
    return socketCall(() => this.#socket.receiveBufferSize());
  }

  setReceiveBufferSize(value: bigint): void {
    socketCall(() => this.#socket.setReceiveBufferSize(value));
  }

  getSendBufferSize(): bigint {
    return socketCall(() => this.#socket.sendBufferSize());
  }

  setSendBufferSize(value: bigint): void {
    socketCall(() => this.#socket.setSendBufferSize(value));
  }
}

export default {
  TcpSocket,
  UdpSocket,
} satisfies typeof import("../../../types/interfaces/wasi-sockets-types.d.ts");
export type * from "../../../types/interfaces/wasi-sockets-types.d.ts";
