declare module "jco:node/http@0.1.0" {
  export const request: import("./http/types.js").DirectHttpHost["request"];
  export const Server: import("./http/types.js").DirectHttpHost["Server"];
}
