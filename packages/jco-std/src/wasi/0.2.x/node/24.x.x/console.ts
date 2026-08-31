import { colorDepth, isTerminal, write } from "jco:node/console@0.1.0";

import { createConsole } from "./console/core.js";

const console = createConsole({ colorDepth, isTerminal, write });

export { Console } from "./console/core.js";
export const assert = console.assert;
export const clear = console.clear;
export const count = console.count;
export const countReset = console.countReset;
export const debug = console.debug;
export const dir = console.dir;
export const dirxml = console.dirxml;
export const error = console.error;
export const group = console.group;
export const groupCollapsed = console.groupCollapsed;
export const groupEnd = console.groupEnd;
export const info = console.info;
export const log = console.log;
export const profile = console.profile;
export const profileEnd = console.profileEnd;
export const table = console.table;
export const time = console.time;
export const timeEnd = console.timeEnd;
export const timeLog = console.timeLog;
export const timeStamp = console.timeStamp;
export const trace = console.trace;
export const warn = console.warn;
export default console;
