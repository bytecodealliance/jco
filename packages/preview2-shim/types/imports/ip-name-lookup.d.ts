export namespace IpNameLookup {
  export function resolveAddresses(network: Network, name: string, addressFamily: IpAddressFamily | null, includeUnavailable: boolean): ResolveAddressStream;
  export function resolveNextAddress(this: ResolveAddressStream): IpAddress | null;
  export function dropResolveAddressStream(this: ResolveAddressStream): void;
  export function nonBlocking(this: ResolveAddressStream): boolean;
  export function setNonBlocking(this: ResolveAddressStream, value: boolean): void;
  export function subscribe(this: ResolveAddressStream): Pollable;
}
import type { Network } from '../imports/network';
export { Network };
import type { IpAddressFamily } from '../imports/network';
export { IpAddressFamily };
export type ResolveAddressStream = number;
import type { Error } from '../imports/network';
export { Error };
import type { IpAddress } from '../imports/network';
export { IpAddress };
import type { Pollable } from '../imports/poll';
export { Pollable };
