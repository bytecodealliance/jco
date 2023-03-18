export namespace IpNameLookup {
  export function resolveAddresses(network: Network, name: string, addressFamily: IpAddressFamily | null, includeUnavailable: boolean): ResolveAddressStream;
  export function resolveNextAddress(this: ResolveAddressStream): IpAddress | null;
  export function dropResolveAddressStream(this: ResolveAddressStream): void;
  export function nonBlocking(this: ResolveAddressStream): boolean;
  export function setNonBlocking(this: ResolveAddressStream, value: boolean): void;
  export function subscribe(this: ResolveAddressStream): Pollable;
}
export type Network = Network;
export type IpAddressFamily = IpAddressFamily;
export type ResolveAddressStream = number;
export type Error = Error;
export type IpAddress = IpAddress;
export type Pollable = Pollable;
