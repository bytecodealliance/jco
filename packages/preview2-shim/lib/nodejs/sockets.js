/* eslint-disable no-unused-vars */

import { WasiSockets } from "./sockets/wasi-sockets.js";

const sockets = new WasiSockets();
export const { 
    ipNameLookup,
    instanceNetwork, 
    network, 
    tcpCreateSocket,
    udpCreateSocket,
    tcp,
    udp,
} = sockets;