/**
 * @param {Parameters<import('../obj/wasm-tools.js').print>[0]} binary
 * @return {Promise<ReturnType<import('../obj/wasm-tools.js').print>>}
 */
export function print(binary: Parameters<import("../obj/wasm-tools.js").print>[0]): Promise<ReturnType<import("../obj/wasm-tools.js").print>>;
/**
 * @param {Parameters<import('../obj/wasm-tools.js').parse>[0]} wat
 * @return {Promise<ReturnType<import('../obj/wasm-tools.js').parse>>}
 */
export function parse(wat: Parameters<import("../obj/wasm-tools.js").parse>[0]): Promise<ReturnType<import("../obj/wasm-tools.js").parse>>;
/**
 * @param {Parameters<import('../obj/wasm-tools.js').componentWit>[0]} binary
 * @return {Promise<ReturnType<import('../obj/wasm-tools.js').componentWit>>}
 */
export function componentWit(binary: Parameters<import("../obj/wasm-tools.js").componentWit>[0]): Promise<ReturnType<import("../obj/wasm-tools.js").componentWit>>;
/**
 * @param {Parameters<import('../obj/wasm-tools.js').componentNew>[0]} binary
 * @param {Parameters<import('../obj/wasm-tools.js').componentNew>[1]} adapters
 * @return {Promise<ReturnType<import('../obj/wasm-tools.js').componentNew>>}
 */
export function componentNew(binary: Parameters<import("../obj/wasm-tools.js").componentNew>[0], adapters: Parameters<import("../obj/wasm-tools.js").componentNew>[1]): Promise<ReturnType<import("../obj/wasm-tools.js").componentNew>>;
/**
 * @param {Parameters<import('../obj/wasm-tools.js').componentEmbed>[0]} embedOpts
 * @return {Promise<ReturnType<import('../obj/wasm-tools.js').componentEmbed>>}
 */
export function componentEmbed(embedOpts: Parameters<import("../obj/wasm-tools.js").componentEmbed>[0]): Promise<ReturnType<import("../obj/wasm-tools.js").componentEmbed>>;
/**
 * @param {Parameters<import('../obj/wasm-tools.js').metadataAdd>[0]} binary
 * @param {Parameters<import('../obj/wasm-tools.js').metadataAdd>[1]} metadata
 * @return {Promise<ReturnType<import('../obj/wasm-tools.js').metadataAdd>>}
 */
export function metadataAdd(binary: Parameters<import("../obj/wasm-tools.js").metadataAdd>[0], metadata: Parameters<import("../obj/wasm-tools.js").metadataAdd>[1]): Promise<ReturnType<import("../obj/wasm-tools.js").metadataAdd>>;
/**
 * @param {Parameters<import('../obj/wasm-tools.js').metadataShow>[0]} binary
 * @return {Promise<ReturnType<import('../obj/wasm-tools.js').metadataShow>>}
 */
export function metadataShow(binary: Parameters<import("../obj/wasm-tools.js").metadataShow>[0]): Promise<ReturnType<import("../obj/wasm-tools.js").metadataShow>>;
export function preview1AdapterCommandPath(): URL;
export function preview1AdapterReactorPath(): URL;
export { optimizeComponent as opt } from "./cmd/opt.js";
export { transpileComponent as transpile, typesComponent as types } from "./cmd/transpile.js";
//# sourceMappingURL=api.d.ts.map