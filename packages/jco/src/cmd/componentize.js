import { stat, readFile, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';

import c from 'chalk-template';

export async function componentize(jsSource, opts) {
    const { componentize: componentizeFn } = await eval(
        'import("@bytecodealliance/componentize-js")'
    );
    if (opts.disable?.includes('all')) {
        opts.disable = ['stdio', 'random', 'clocks', 'http'];
    }
    const source = await readFile(jsSource, 'utf8');

    const witPath = resolve(opts.wit);
    const sourceName = basename(jsSource);

    let component;
    try {
        const result = await componentizeFn(source, {
            enableAot: opts.aot,
            aotMinStackSizeBytes: opts.aotMinStackSizeBytes,
            wevalBin: opts.wevalBin,
            sourceName,
            witPath,
            worldName: opts.worldName,
            disableFeatures: opts.disable,
            enableFeatures: opts.enable,
            preview2Adapter: opts.preview2Adapter,
            debugBuild: opts.debugStarlingmonkeyBuild,
            debug: {
                bindings: opts.debugBindings,
                bindingsDir: opts.debugBindingsDir,
                binary: opts.debugBinary,
                binaryPath: opts.debugBinaryPath,
                enableWizerLogging: opts.debugEnableWizerLogging,
            },
        });
        if (result.debug) {
            console.error(
                c`{cyan DEBUG} Debug output\n${JSON.stringify(debug, null, 2)}\n`
            );
        }

        component = result.component;
    } catch (err) {
        // Detect package resolution issues that usually mean a misconfigured "witPath"
        if (err.toString().includes('no known packages')) {
            const isFile = await stat(witPath).then((s) => s.isFile());
            if (isFile) {
                const hint = await printWITPathHint(witPath);
                if (err.message) {
                    err.message += `\n${hint}`;
                }
            }
        }
        throw err;
    }

    await writeFile(opts.out, component);

    console.log(c`{green OK} Successfully written {bold ${opts.out}}.`);
}

/**
 * Print a hint about the witPath option that may be incorrect
 *
 * @param {string} witPath - witPath option that was used (which is a path that resolves to a file or directory)
 * @returns {string} user-visible, highlighted output that can be printed
 */
async function printWITPathHint(witPath) {
    const pathMeta = await stat(witPath);
    let output = '\n';
    if (!pathMeta.isFile() && !pathMeta.isDirectory()) {
        output += c`{yellow.bold warning} The supplited WIT path [${witPath}] is neither a file or directory.\n`;
        return output;
    }
    output += c`{yellow.bold warning} Your WIT path option [${witPath}] may be incorrect\n`;
    output += c`{yellow.bold warning} When using a world with dependencies, you must pass the enclosing WIT folder, not a single file.\n`;
    output += c`{yellow.bold warning} (e.g. 'wit/', rather than 'wit/component.wit').\n`;
    return output;
}
