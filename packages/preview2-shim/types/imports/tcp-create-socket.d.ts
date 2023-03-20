export namespace TcpCreateSocket {
  export function createTcpSocket(addressFamily: IpAddressFamily): TcpSocket;
}
import type { IpAddressFamily } from '../imports/network';
export { IpAddressFamily };
import type { TcpSocket } from '../imports/tcp';
export { TcpSocket };
import type { Error } from '../imports/network';
export { Error };
