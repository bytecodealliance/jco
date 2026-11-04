import * as host from "jco:node/fs@0.1.0";
import { createFsCore } from "./core.js";

// Compatibility entry for internal consumers. The public entry points do not
// import this aggregate, so named imports never construct a full core.
export const filesystemCore = createFsCore(host);
export { default as promises } from "../fs-promises.js";
export { default as filesystem } from "../fs.js";
