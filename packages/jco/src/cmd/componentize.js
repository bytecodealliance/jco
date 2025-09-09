import { stat, readFile, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { styleText } from '../common.js';

/** All features that can be enabled/disabled */
const ALL_FEATURES = ['clocks', 'http', 'random', 'stdio', 'fetch-event'];

/** Features that should be used for --debug mode */
const DEBUG_FEATURES = ['stdio'];

export async function componentize(jsSource, opts) {
    const { componentize: componentizeFn } = await eval(
        'import("@bytecodealliance/componentize-js")'
    );

    const { disableFeatures, enableFeatures } = calculateFeatureSet(opts);

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
            disableFeatures,
            enableFeatures,
            preview2Adapter: opts.preview2Adapter,
            debugBuild: opts.debugStarlingmonkeyBuild,
            engine: opts.engine,
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
                `${styleText('cyan', 'DEBUG')} Debug output\n${JSON.stringify(debug, null, 2)}\n`
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

    console.log(`${styleText('green', 'OK')} Successfully written ${styleText('bold', opts.out)}.`);
}

/**
 * Print a hint about the witPath option that may be incorrect
 *
 * @param {string} witPath - witPath option that was used (which is a path that resolves to a file or directory)
 * @returns {string} user-visible, highlighted output that can be printed
 */
async function printWITPathHint(witPath) {
    const warningPrefix = styleText(['yellow', 'bold'], 'warning');
    const pathMeta = await stat(witPath);
    let output = '\n';
    if (!pathMeta.isFile() && !pathMeta.isDirectory()) {
        output += `${warningPrefix} The supplited WIT path [${witPath}] is neither a file or directory.\n`;
        return output;
    }
    output += `${warningPrefix} Your WIT path option [${witPath}] may be incorrect\n`;
    output += `${warningPrefix} When using a world with dependencies, you must pass the enclosing WIT folder, not a single file.\n`;
    output += `${warningPrefix} (e.g. 'wit/', rather than 'wit/component.wit').\n`;
    return output;
}

/**
 * Build set of disabled features
 *
 * At present, `componentize-js` does not use enabled features but exclusively
 * takes into account disabled features.
 *
 * @param {{ debug: boolean, disable: string[], enable: string[] }} opts
 * @returns {{ disableFeatures: string[], enableFeatures: string[] }}
 */
function calculateFeatureSet(opts) {
    const disableFeatures = new Set(opts?.debug ? DEBUG_FEATURES : []);
    const disable = opts?.disable ?? [];
    const enable = opts?.enable ?? [];

    // Process disabled features
    if (disable.includes('all')) {
        ALL_FEATURES.forEach((v) => disableFeatures.add(v));
    } else {
        disable.forEach((v) => disableFeatures.add(v));
    }

    // Process enabled features
    if (enable.includes('all')) {
        ALL_FEATURES.forEach((v) => disableFeatures.delete(v));
    } else {
        enable.forEach((v) => disableFeatures.delete(v));
    }

    return {
        disableFeatures: [...disableFeatures],
        enableFeatures: ALL_FEATURES.filter((v) => !disableFeatures.has(v)),
    };
}
