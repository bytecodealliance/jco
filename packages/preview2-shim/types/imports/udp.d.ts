export namespace Udp {
  export function bind(this: UdpSocket, network: Network, localAddress: IpSocketAddress): void;
  export function connect(this: UdpSocket, network: Network, remoteAddress: IpSocketAddress): void;
  export function receive(this: UdpSocket): Datagram;
  export function send(this: UdpSocket, datagram: Datagram): void;
  export function localAddress(this: UdpSocket): IpSocketAddress;
  export function remoteAddress(this: UdpSocket): IpSocketAddress;
  export function addressFamily(this: UdpSocket): IpAddressFamily;
  export function ipv6Only(this: UdpSocket): boolean;
  export function setIpv6Only(this: UdpSocket, value: boolean): void;
  export function unicastHopLimit(this: UdpSocket): number;
  export function setUnicastHopLimit(this: UdpSocket, value: number): void;
  export function receiveBufferSize(this: UdpSocket): bigint;
  export function setReceiveBufferSize(this: UdpSocket, value: bigint): void;
  export function sendBufferSize(this: UdpSocket): bigint;
  export function setSendBufferSize(this: UdpSocket, value: bigint): void;
  export function nonBlocking(this: UdpSocket): boolean;
  export function setNonBlocking(this: UdpSocket, value: boolean): void;
  export function subscribe(this: UdpSocket): Pollable;
  export function dropUdpSocket(this: UdpSocket): void;
}
export type UdpSocket = number;
export type Network = Network;
export type IpSocketAddress = IpSocketAddress;
export type Error = Error;
export interface Datagram {
  data: Uint8Array,
  remoteAddress: IpSocketAddress,
}
export type IpAddressFamily = IpAddressFamily;
export type Pollable = Pollable;
