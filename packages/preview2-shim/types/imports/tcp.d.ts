export namespace Tcp {
  export function bind(this: TcpSocket, network: Network, localAddress: IpSocketAddress): void;
  export function connect(this: TcpSocket, network: Network, remoteAddress: IpSocketAddress): [InputStream, OutputStream];
  export function listen(this: TcpSocket, network: Network): void;
  export function accept(this: TcpSocket): [TcpSocket, InputStream, OutputStream];
  export function localAddress(this: TcpSocket): IpSocketAddress;
  export function remoteAddress(this: TcpSocket): IpSocketAddress;
  export function addressFamily(this: TcpSocket): IpAddressFamily;
  export function ipv6Only(this: TcpSocket): boolean;
  export function setIpv6Only(this: TcpSocket, value: boolean): void;
  export function setListenBacklogSize(this: TcpSocket, value: bigint): void;
  export function keepAlive(this: TcpSocket): boolean;
  export function setKeepAlive(this: TcpSocket, value: boolean): void;
  export function noDelay(this: TcpSocket): boolean;
  export function setNoDelay(this: TcpSocket, value: boolean): void;
  export function unicastHopLimit(this: TcpSocket): number;
  export function setUnicastHopLimit(this: TcpSocket, value: number): void;
  export function receiveBufferSize(this: TcpSocket): bigint;
  export function setReceiveBufferSize(this: TcpSocket, value: bigint): void;
  export function sendBufferSize(this: TcpSocket): bigint;
  export function setSendBufferSize(this: TcpSocket, value: bigint): void;
  export function nonBlocking(this: TcpSocket): boolean;
  export function setNonBlocking(this: TcpSocket, value: boolean): void;
  export function subscribe(this: TcpSocket): Pollable;
  export function shutdown(this: TcpSocket, shutdownType: ShutdownType): void;
  export function dropTcpSocket(this: TcpSocket): void;
}
export type TcpSocket = number;
export type Network = Network;
export type IpSocketAddress = IpSocketAddress;
export type Error = Error;
export type InputStream = InputStream;
export type OutputStream = OutputStream;
export type IpAddressFamily = IpAddressFamily;
export type Pollable = Pollable;
/**
 * # Variants
 * 
 * ## `"receive"`
 * 
 * ## `"send"`
 * 
 * ## `"both"`
 */
export type ShutdownType = 'receive' | 'send' | 'both';
