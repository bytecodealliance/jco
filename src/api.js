export { optimizeComponent as opt } from './cmd/opt.js';
export { transpileComponent as transpile } from './cmd/transpile.js';
import { exports } from '../obj/wasm-tools.js';
export const { parse, print, componentNew, componentWit, componentEmbed, metadataAdd, metadataShow } = exports;
