/**
 * @param {Uint8Array} binary
 */
export function print(binary: Uint8Array): Promise<string>;
/**
 * @param {string} wat
 */
export function parse(wat: string): Promise<Uint8Array<ArrayBufferLike>>;
/**
 * @param {Uint8Array} binary
 */
export function componentWit(binary: Uint8Array): Promise<string>;
/**
 * @param {Uint8Array} binary
 * @param {Array<[string, Uint8Array]>} [adapters]
 */
export function componentNew(binary: Uint8Array, adapters?: Array<[string, Uint8Array]>): Promise<Uint8Array<ArrayBufferLike>>;
/**
 * @param {tools.EmbedOpts} embedOpts
 */
export function componentEmbed(embedOpts: tools.EmbedOpts): Promise<Uint8Array<ArrayBufferLike>>;
/**
 * @param {Uint8Array} binary
 * @param {tools.ProducersFields} metadata
 */
export function metadataAdd(binary: Uint8Array, metadata: tools.ProducersFields): Promise<Uint8Array<ArrayBufferLike>>;
/**
 * @param {Uint8Array} binary
 */
export function metadataShow(binary: Uint8Array): Promise<tools.ModuleMetadata[]>;
export function preview1AdapterCommandPath(): URL;
export function preview1AdapterReactorPath(): URL;
export { optimizeComponent as opt } from "./cmd/opt.js";
import { tools } from "../obj/wasm-tools.js";
export { transpileComponent as transpile, typesComponent as types } from "./cmd/transpile.js";
//# sourceMappingURL=api.d.ts.map