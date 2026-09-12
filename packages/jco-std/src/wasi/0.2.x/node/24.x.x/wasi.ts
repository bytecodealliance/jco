import * as host from "jco:node/wasi@0.1.0";

import { createWasi } from "./wasi/core.js";

const wasi = createWasi(host);

export type * from "./wasi/types.js";
export const { WASI } = wasi;
export default wasi;
