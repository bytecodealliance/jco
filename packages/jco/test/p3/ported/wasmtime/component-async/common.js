import { fileURLToPath, URL } from 'node:url';
import { exec as syncExec } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { stat } from "node:fs/promises";

import which from "which";

import { setupAsyncTest, getTmpDir } from '../../../../helpers.js';

const exec = promisify(syncExec);

export const COMPONENT_FIXTURES_DIR = fileURLToPath(
    new URL('../../../../fixtures/components', import.meta.url)
);

/** Ensure that the given file path exists */
async function ensureFile(filePath) {
    if (!filePath) { throw new Error("missing componentPath"); }
    const meta = await stat(filePath);
    if (!meta.isFile()) {
        throw new Error(`non-file at [${filePath}]`);
    }
    return resolve(filePath);
}

/**
 * Build and transpile a component for use in a test
 *
 * @param {object} args
 * @param {string} args.componentPath - path to the wasm binary that should be tested
 * @param {object} args.noCleanup - avoid cleaning up the async test
 * @param {object} args.transpile - options to control transpile
 * @param {object} args.transpile.extraArgs - extra arguments that should be used during transpilation (ex. `{minify: false}`)
 * @returns {Promise<void>} A Promise that resolves when the test completes
 */
export async function buildAndTranspile(args) {
    const componentPath = await ensureFile(args.componentPath);
    const { esModule, cleanup, outputDir } = await setupAsyncTest({
        asyncMode: 'jspi',
        component: {
            name: 'async-error-context',
            path: componentPath,
            skipInstantiation: true,
        },
        jco: {
            transpile: {
                extraArgs: {
                    ...(args.transpile?.extraArgs || {}),
                    asyncExports: ['local:local/run#run'],
                },
            },
        },
    });

    const { WASIShim } = await import(
        '@bytecodealliance/preview2-shim/instantiation'
    );
    const instance = await esModule.instantiate(
        undefined,
        {
            ...new WASIShim().getImportObject(),
            ...(args.instantiation?.imports ?? {}),
        }
    );

    return {
        instance,
        esModule,
        cleanup,
        outputDir,
    };
}

/**
 * Compose two components that are a caller and callee in the style of tests in upstream wasmtime
 * by calling out to the `wasm-tools` binary
 *
 * @see https://github.com/bytecodealliance/wasmtime/blob/main/crates/misc/component-async-tests/tests/scenario/util.rs
 *
 * @param {object} args
 * @param {string} args.callerPath - path to the caller wasm binary
 * @param {string} args.calleePath - path to the callee wasm binary
 * @param {string} [args.wasmToolsBinPath] - path to wasm tools binary
 * @param {string} [args.outputPath] - path the output component should be written to
 * @returns {Promise<string>} A Promise that resolves to the path to the composed component in a tempdir
 */
export async function composeCallerCallee(args) {
    const callerPath = await ensureFile(args.callerPath);
    const calleePath = await ensureFile(args.calleePath);

    let outputComponentPath = args.outputPath;
    if (!outputComponentPath) {
        const tmpDir = await getTmpDir();
        outputComponentPath = resolve(tmpDir, 'composed.wasm');
    }

    const wasmToolsBinPath = args.wasmToolsBinPath ?? await which('wasm-tools');
    await ensureFile(wasmToolsBinPath);

    const cmd = [
        wasmToolsBinPath,
        "compose",
        callerPath,
        "--definitions",
        calleePath,
        "--output",
        outputComponentPath,
        // TODO: validation in wasm-tools compose should arguably have async turned on
        // https://github.com/bytecodealliance/wasm-tools/pull/2354
        "--skip-validation",
    ].join(" ");
    await exec(cmd);

    return await ensureFile(outputComponentPath);
}
