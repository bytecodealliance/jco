// @ts-check
export { optimizeComponent as opt } from "./cmd/opt.js";
export { transpileComponent as transpile, typesComponent as types } from "./cmd/transpile.js";
import { $init, tools } from "../obj/wasm-tools.js";
const {
    print: printFn,
    parse: parseFn,
    componentWit: componentWitFn,
    componentNew: componentNewFn,
    componentEmbed: componentEmbedFn,
    metadataAdd: metadataAddFn,
    metadataShow: metadataShowFn,
} = tools;

/**
 * @param {Uint8Array} binary
 */
export async function print(binary) {
    await $init;
    return printFn(binary);
}
/**
 * @param {string} wat
 */
export async function parse(wat) {
    await $init;
    return parseFn(wat);
}
/**
 * @param {Uint8Array} binary
 */
export async function componentWit(binary) {
    await $init;
    return componentWitFn(binary);
}
/**
 * @param {Uint8Array} binary
 * @param {Array<[string, Uint8Array]>} [adapters]
 */
export async function componentNew(binary, adapters) {
    await $init;
    return componentNewFn(binary, adapters);
}
/**
 * @param {tools.EmbedOpts} embedOpts
 */
export async function componentEmbed(embedOpts) {
    await $init;
    return componentEmbedFn(embedOpts);
}
/**
 * @param {Uint8Array} binary
 * @param {tools.ProducersFields} metadata
 */
export async function metadataAdd(binary, metadata) {
    await $init;
    return metadataAddFn(binary, metadata);
}
/**
 * @param {Uint8Array} binary
 */
export async function metadataShow(binary) {
    await $init;
    return metadataShowFn(binary);
}

export function preview1AdapterCommandPath() {
    return new URL("../lib/wasi_snapshot_preview1.command.wasm", import.meta.url);
}
export function preview1AdapterReactorPath() {
    return new URL("../lib/wasi_snapshot_preview1.reactor.wasm", import.meta.url);
}
