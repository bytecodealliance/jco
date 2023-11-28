import { WasiSockets } from "./sockets/wasi-sockets.js";

export const { 
    ipNameLookup,
    instanceNetwork, 
    network, 
    tcpCreateSocket,
    udpCreateSocket,
    tcp,
    udp,
} = new WasiSockets();