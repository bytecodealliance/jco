export { optimizeComponent as opt } from './cmd/opt.js';
export { transpileComponent as transpile, typesComponent as types } from './cmd/transpile.js';
import { $init, tools } from "../obj/wasm-tools.js";
const { print: printFn, parse: parseFn, componentWit: componentWitFn, componentNew: componentNewFn, componentEmbed: componentEmbedFn, metadataAdd: metadataAddFn, metadataShow: metadataShowFn } = tools;

/**
 * @param {Parameters<import('../obj/wasm-tools.js').print>[0]} binary
 * @return {Promise<ReturnType<import('../obj/wasm-tools.js').print>>}
 */
export async function print (binary) {
  await $init;
  return printFn(binary);
}
/**
 * @param {Parameters<import('../obj/wasm-tools.js').parse>[0]} wat
 * @return {Promise<ReturnType<import('../obj/wasm-tools.js').parse>>}
 */
export async function parse (wat) {
  await $init;
  return parseFn(wat);
}
/**
 * @param {Parameters<import('../obj/wasm-tools.js').componentWit>[0]} binary
 * @return {Promise<ReturnType<import('../obj/wasm-tools.js').componentWit>>}
 */
export async function componentWit (binary) {
  await $init;
  return componentWitFn(binary);
}
/**
 * @param {Parameters<import('../obj/wasm-tools.js').componentNew>[0]} binary
 * @param {Parameters<import('../obj/wasm-tools.js').componentNew>[1]} adapters
 * @return {Promise<ReturnType<import('../obj/wasm-tools.js').componentNew>>}
 */
export async function componentNew (binary, adapters) {
  await $init;
  return componentNewFn(binary, adapters);
}
/**
 * @param {Parameters<import('../obj/wasm-tools.js').componentEmbed>[0]} embedOpts
 * @return {Promise<ReturnType<import('../obj/wasm-tools.js').componentEmbed>>}
 */
export async function componentEmbed (embedOpts) {
  await $init;
  return componentEmbedFn(embedOpts);
}
/**
 * @param {Parameters<import('../obj/wasm-tools.js').metadataAdd>[0]} binary
 * @param {Parameters<import('../obj/wasm-tools.js').metadataAdd>[1]} metadata
 * @return {Promise<ReturnType<import('../obj/wasm-tools.js').metadataAdd>>}
 */
export async function metadataAdd (binary, metadata) {
  await $init;
  return metadataAddFn(binary, metadata);
}
/**
 * @param {Parameters<import('../obj/wasm-tools.js').metadataShow>[0]} binary
 * @return {Promise<ReturnType<import('../obj/wasm-tools.js').metadataShow>>}
 */
export async function metadataShow (binary) {
  await $init;
  return metadataShowFn(binary);
}
export function preview1AdapterCommandPath () {
  return new URL('../lib/wasi_snapshot_preview1.command.wasm', import.meta.url);
}
export function preview1AdapterReactorPath () {
  return new URL('../lib/wasi_snapshot_preview1.reactor.wasm', import.meta.url);
}
