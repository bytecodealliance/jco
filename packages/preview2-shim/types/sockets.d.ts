import type { WasiSocketsInstanceNetwork } from './interfaces/wasi-sockets-instance-network.d.ts';
import type { WasiSocketsIpNameLookup } from './interfaces/wasi-sockets-ip-name-lookup.d.ts';
import type { WasiSocketsNetwork } from './interfaces/wasi-sockets-network.d.ts';
import type { WasiSocketsTcpCreateSocket } from './interfaces/wasi-sockets-tcp-create-socket.d.ts';
import type { WasiSocketsTcp } from './interfaces/wasi-sockets-tcp.d.ts';
import type { WasiSocketsUdpCreateSocket } from './interfaces/wasi-sockets-udp-create-socket.d.ts';
import type { WasiSocketsUdp } from './interfaces/wasi-sockets-udp.d.ts';

export const instanceNetwork: typeof WasiSocketsInstanceNetwork;
export const ipNameLookup: typeof WasiSocketsIpNameLookup;
export const network: typeof WasiSocketsNetwork;
export const tcpCreateSocket: typeof WasiSocketsTcpCreateSocket;
export const tcp: typeof WasiSocketsTcp;
export const udpCreateSocket: typeof WasiSocketsUdpCreateSocket;
export const udp: typeof WasiSocketsUdp;
