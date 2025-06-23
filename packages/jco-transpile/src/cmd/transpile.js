import { writeFiles, printFileSummary } from '../common.js';

/**
 * @typedef {import("commander").Command} Command
 */

/**
 * CLI Command entrypoint for transpilation
 *
 * Transpile a provided WebAssembly component to an ES module
 * that can be run in JS environments
 *
 * @param {Buffer | string | URL | FileHandle} componentPath
 * @param {import('../transpile.js').TranspilationOptions} [opts]
 * @param {Command} [command] - command being run (commander)
 * @returns {Promise<import('../transpile.js').TranspilationResult>}
 */
export async function transpile(componentPath, opts, command) {
    const varIdx = command?.parent.rawArgs.indexOf('--');
    if (varIdx !== undefined && varIdx !== -1) {
        opts.optArgs = command.parent.rawArgs.slice(varIdx + 1);
    }
    const files = await transpile(componentPath, opts);
    await writeFiles(files);
    await printFileSummary(
        files,
        opts.quiet ? false : 'Transpiled JS Component Files'
    );
}
