import * as host from "jco:node/tty@0.1.0";

import { createTty } from "./tty/core.js";

const tty = createTty(host);

export type * from "./tty/types.js";
export const { isatty, ReadStream, WriteStream } = tty;
export default tty;
