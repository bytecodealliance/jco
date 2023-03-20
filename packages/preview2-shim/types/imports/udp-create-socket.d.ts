export namespace UdpCreateSocket {
  export function createUdpSocket(addressFamily: IpAddressFamily): UdpSocket;
}
import type { IpAddressFamily } from '../imports/network';
export { IpAddressFamily };
import type { UdpSocket } from '../imports/udp';
export { UdpSocket };
import type { Error } from '../imports/network';
export { Error };
