export namespace Network {
  export function dropNetwork(this: Network): void;
}
export type Network = number;
export type Ipv6Address = [number, number, number, number, number, number, number, number];
export interface Ipv6SocketAddress {
  port: number,
  flowInfo: number,
  address: Ipv6Address,
  scopeId: number,
}
export type Ipv4Address = [number, number, number, number];
export interface Ipv4SocketAddress {
  port: number,
  address: Ipv4Address,
}
export type IpSocketAddress = IpSocketAddressIpv4 | IpSocketAddressIpv6;
export interface IpSocketAddressIpv4 {
  tag: 'ipv4',
  val: Ipv4SocketAddress,
}
export interface IpSocketAddressIpv6 {
  tag: 'ipv6',
  val: Ipv6SocketAddress,
}
export type IpAddress = IpAddressIpv4 | IpAddressIpv6;
export interface IpAddressIpv4 {
  tag: 'ipv4',
  val: Ipv4Address,
}
export interface IpAddressIpv6 {
  tag: 'ipv6',
  val: Ipv6Address,
}
/**
 * # Variants
 * 
 * ## `"unknown"`
 * 
 * ## `"again"`
 */
export type Error = 'unknown' | 'again';
/**
 * # Variants
 * 
 * ## `"ipv4"`
 * 
 * ## `"ipv6"`
 */
export type IpAddressFamily = 'ipv4' | 'ipv6';
