import { $init as $initBindgenComponent, scripts } from '../vendor/js-component-bindgen-component.js';
import type { scripts as ScriptsNamespace } from '../vendor/js-component-bindgen-component.js';
import { ensureWitFilesystemPreopen } from './preopens.js';

export type ScriptComponentOpts = ScriptsNamespace.ScriptComponentOpts;
export type ScriptEngineBackend = ScriptsNamespace.ScriptEngineBackend;
export type ScriptEngineWitInput = ScriptsNamespace.ScriptEngineWitInput;
export type ScriptEngineWorld = ScriptsNamespace.ScriptEngineWorld;

/**
 * Merge WIT worlds into a script engine world and generate the engine's bootstrap module
 *
 * The bootstrap is componentized like any other script to produce an engine component whose
 * exports forward to whichever script `jco:script-engine/script-loader` loaded last.
 *
 * @param inputs - WIT paths (and optional world names) the engine must support
 * @param backend - JavaScript engine the bootstrap will be componentized with
 * @returns the engine world WIT, bootstrap module, and its import/export names
 */
export async function createWorld(
    inputs: ScriptEngineWitInput[],
    backend: ScriptEngineBackend,
): Promise<ScriptEngineWorld> {
    ensureWitFilesystemPreopen();
    await $initBindgenComponent;
    return scripts.createWorld(inputs, backend);
}

/**
 * Package a bundled ES module as a component exporting `jco:script/script`
 *
 * @param opts - the script, its name, and the engine world it targets
 * @returns WebAssembly component bytes
 */
export async function createComponent(opts: ScriptComponentOpts): Promise<Uint8Array> {
    await $initBindgenComponent;
    return scripts.createComponent(opts);
}
