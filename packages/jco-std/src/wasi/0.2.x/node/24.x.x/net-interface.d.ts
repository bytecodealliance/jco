declare module "wasi:sockets/instance-network@0.2.12" {
  export const instanceNetwork: import("./internal/wasi-sockets.js").WasiSocketsProvider["instanceNetwork"]["instanceNetwork"];
}

declare module "wasi:sockets/ip-name-lookup@0.2.12" {
  export const resolveAddresses: import("./internal/wasi-sockets.js").WasiSocketsProvider["ipNameLookup"]["resolveAddresses"];
}

declare module "wasi:sockets/tcp-create-socket@0.2.12" {
  export const createTcpSocket: import("./internal/wasi-sockets.js").WasiSocketsProvider["tcpCreateSocket"]["createTcpSocket"];
}
