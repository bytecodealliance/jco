export { optimizeComponent as opt } from './cmd/opt.js';
export { transpileComponent as transpile } from './cmd/transpile.js';
import { $init, print as printFn, parse as parseFn, componentWit as componentWitFn, componentNew as componentNewFn, componentEmbed as componentEmbedFn, metadataAdd as metadataAddFn, metadataShow as metadataShowFn } from "../obj/wasm-tools.js";

/** @type {import('../obj/wasm-tools.js').print} */
export async function print (binary) {
  await $init;
  return printFn(binary);
}
/** @type {import('../obj/wasm-tools.js').parse} */
export async function parse (wat) {
  await $init;
  return parseFn(wat);
}
/** @type {import('../obj/wasm-tools.js').componentWit} */
export async function componentWit (binary) {
  await $init;
  return componentWitFn(binary);
}
/** @type {import('../obj/wasm-tools.js').componentNew} */
export async function componentNew (binary, adapters) {
  await $init;
  return componentNewFn(binary, adapters);
}
/** @type {import('../obj/wasm-tools.js').componentEmbed} */
export async function componentEmbed (embedOpts) {
  await $init;
  return componentEmbedFn(embedOpts);
}
/** @type {import('../obj/wasm-tools.js').metadataAdd} */
export async function metadataAdd () {
  await $init;
  return metadataAddFn(binary, metadata);
}
/** @type {import('../obj/wasm-tools.js').metadataShow} */
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
