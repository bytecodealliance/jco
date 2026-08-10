import { Todo } from "../../common/errors.js";
import type {
  Duration,
  ErrorCode,
  IpAddressFamily,
  IpSocketAddress,
  Result,
  TcpSocket as TcpSocketT,
  UdpSocket as UdpSocketT,
} from "../../../types/interfaces/wasi-sockets-types.d.ts";

export class TcpSocket implements TcpSocketT {
  static create(addressFamily: IpAddressFamily): TcpSocket {
    throw new Todo();
  }
  bind(localAddress: IpSocketAddress): void {
    throw new Todo();
  }
  connect(remoteAddress: IpSocketAddress): Promise<void> {
    throw new Todo();
  }
  listen(): ReadableStream<TcpSocketT> {
    throw new Todo();
  }
  send(data: ReadableStream<number>): Promise<Result<void, ErrorCode>> {
    throw new Todo();
  }
  receive(): [ReadableStream<number>, Promise<Result<void, ErrorCode>>] {
    throw new Todo();
  }
  getLocalAddress(): IpSocketAddress {
    throw new Todo();
  }
  getRemoteAddress(): IpSocketAddress {
    throw new Todo();
  }
  getIsListening(): boolean {
    throw new Todo();
  }
  getAddressFamily(): IpAddressFamily {
    throw new Todo();
  }
  setListenBacklogSize(value: bigint): void {
    throw new Todo();
  }
  getKeepAliveEnabled(): boolean {
    throw new Todo();
  }
  setKeepAliveEnabled(value: boolean): void {
    throw new Todo();
  }
  getKeepAliveIdleTime(): Duration {
    throw new Todo();
  }
  setKeepAliveIdleTime(value: Duration): void {
    throw new Todo();
  }
  getKeepAliveInterval(): Duration {
    throw new Todo();
  }
  setKeepAliveInterval(value: Duration): void {
    throw new Todo();
  }
  getKeepAliveCount(): number {
    throw new Todo();
  }
  setKeepAliveCount(value: number): void {
    throw new Todo();
  }
  getHopLimit(): number {
    throw new Todo();
  }
  setHopLimit(value: number): void {
    throw new Todo();
  }
  getReceiveBufferSize(): bigint {
    throw new Todo();
  }
  setReceiveBufferSize(value: bigint): void {
    throw new Todo();
  }
  getSendBufferSize(): bigint {
    throw new Todo();
  }
  setSendBufferSize(value: bigint): void {
    throw new Todo();
  }
}

export class UdpSocket implements UdpSocketT {
  static create(addressFamily: IpAddressFamily): UdpSocket {
    throw new Todo();
  }
  bind(localAddress: IpSocketAddress): void {
    throw new Todo();
  }
  connect(remoteAddress: IpSocketAddress): void {
    throw new Todo();
  }
  disconnect(): void {
    throw new Todo();
  }
  send(data: Uint8Array, remoteAddress: IpSocketAddress | undefined): Promise<void> {
    throw new Todo();
  }
  receive(): Promise<[Uint8Array, IpSocketAddress]> {
    throw new Todo();
  }
  getLocalAddress(): IpSocketAddress {
    throw new Todo();
  }
  getRemoteAddress(): IpSocketAddress {
    throw new Todo();
  }
  getAddressFamily(): IpAddressFamily {
    throw new Todo();
  }
  getUnicastHopLimit(): number {
    throw new Todo();
  }
  setUnicastHopLimit(value: number): void {
    throw new Todo();
  }
  getReceiveBufferSize(): bigint {
    throw new Todo();
  }
  setReceiveBufferSize(value: bigint): void {
    throw new Todo();
  }
  getSendBufferSize(): bigint {
    throw new Todo();
  }
  setSendBufferSize(value: bigint): void {
    throw new Todo();
  }
}

export default {
  TcpSocket,
  UdpSocket,
} satisfies typeof import("../../../types/interfaces/wasi-sockets-types.d.ts");
export type * from "../../../types/interfaces/wasi-sockets-types.d.ts";
