import { $init, tools } from '../vendor/wasm-tools.js';
import type { tools as ToolsNamespace } from '../vendor/wasm-tools.js';

/**
 * Generate WIT metadata for a given world
 *
 * @param worldWitSpecifier - WIT specifier for the selected world
 * @param [worldName] - the world name
 * @returns WIT metadata for the provided world
 */
export async function componentWitMetadataForWorld(
    worldWitSpecifier: ToolsNamespace.WitSpecifier,
    worldName: string | undefined,
): Promise<ToolsNamespace.WitMetadata> {
    await $init;
    return tools.componentWitMetadataForWorld(worldWitSpecifier, worldName);
}

/**
 * Retrieve metadata given a WebAssembly component binary
 *
 * @param bytes - WebAssembly component bytes
 * @returns module metadata for the provided component
 */
export async function metadataShow(bytes: Uint8Array): Promise<ToolsNamespace.ModuleMetadata[]> {
    await $init;
    return tools.metadataShow(bytes);
}

/**
 * Print WebAssembly Text format (WAT) for a given WebAssembly component
 *
 * @param bytes - WebAssembly component bytes
 * @returns WAT for the provided component
 */
export async function print(bytes: Uint8Array): Promise<string> {
    await $init;
    return tools.print(bytes);
}

/**
 * Parse WebAssembly Text format (WAT) into a WebAssembly component
 *
 * @param wat - A component in WAT format
 * @returns WebAssembly component bytes
 */
export async function parse(wat: string): Promise<Uint8Array> {
    await $init;
    return tools.parse(wat);
}

/**
 * Create a new component from a core WebAssembly module
 *
 * @param bytes - WebAssembly module bytes
 * @param adapters - Adapters that should be used on the given module
 * @returns WebAssembly component bytes
 */
export async function componentNew(
    bytes: Uint8Array,
    adapters: Array<[string, Uint8Array]> | undefined,
): Promise<Uint8Array> {
    await $init;
    return tools.componentNew(bytes, adapters);
}

/**
 * Retrieve the WIT as a string from a given component
 *
 * @param bytes - WebAssembly component bytes
 * @returns Component WIT as a string
 */
export async function componentWit(bytes: Uint8Array): Promise<string> {
    await $init;
    return tools.componentWit(bytes);
}

/**
 * Embed WIT metadata in a given WebAssembly binary
 *
 * @param opts - options or performing the embedding
 * @returns WebAssembly binary bytes with WIT metadata embedded
 */
export async function componentEmbed(opts: ToolsNamespace.EmbedOpts): Promise<Uint8Array> {
    await $init;
    return tools.componentEmbed(opts);
}

/**
 * Add provided metadata to a given WebAssembly component
 *
 * @param bytes - WebAssembly component bytes
 * @param producerMetadata - producer metadata to add to the component
 * @returns WebAssembly binary bytes with WIT metadata embedded
 */
export async function metadataAdd(bytes: Uint8Array, metadata: ToolsNamespace.ProducersFields): Promise<Uint8Array> {
    await $init;
    return tools.metadataAdd(bytes, metadata);
}
