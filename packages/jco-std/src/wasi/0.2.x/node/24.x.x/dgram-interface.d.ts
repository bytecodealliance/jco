declare module "jco:node/dgram@0.1.0" {
  export const Socket: import("./dgram/types.js").DgramHost["Socket"];
  export const createSocket: import("./dgram/types.js").DgramHost["createSocket"];
}
