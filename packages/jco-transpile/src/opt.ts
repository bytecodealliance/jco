import { fileURLToPath } from 'node:url';

import { byteLengthLEB128, runWASMTransformProgram } from './common.js';

import { $init, tools } from '../vendor/wasm-tools.js';
const { metadataShow, print } = tools;

export interface OptimizeOptions {
    quiet: boolean;
    asyncify?: boolean;
    optArgs?: string[];
    noVerify?: boolean;
}

export interface OptimizeResult {
    component: Uint8Array;
    compressionInfo: { beforeBytes: number; afterBytes: number }[];
}

/**
 * @typedef {{
 *  quiet: boolean,
 *  asyncify?: boolean,
 *  optArgs?: string[],
 *  noVerify?: boolean
 * }} OptimizeOptions
 */

/**
 * @typedef {{
 *  component: Uint8Array,
 *  compressionInfo: { beforeBytes: number, afterBytes: number }[],
 * }} OptimizeResult
 */

/**
 * Perform optimization for a given component
 *
 * @param {Uint8Array} componentBytes
 * @param {OptimizeOptions} [opts]
 * @returns {Promise<OptimizeResult>}
 */
export async function runOptimizeComponent(
    componentBytes: Uint8Array,
    opts?: OptimizeOptions
): Promise<OptimizeResult> {
    await $init;

    let componentMetadata = metadataShow(componentBytes);
    componentMetadata.forEach((metadata, index) => {
        metadata.index = index;
        const size = metadata.range[1] - metadata.range[0];
        metadata.prevLEBLen = byteLengthLEB128(size);
    });

    const coreModules = componentMetadata.filter(
        ({ metaType }) => metaType.tag === 'module'
    );

    // Gather the options for wasm-opt. optionally, adding the asyncify flag
    const args = opts?.optArgs
        ? [...opts.optArgs]
        : [
              '-Oz',
              '--low-memory-unused',
              '--enable-bulk-memory',
              '--strip-debug',
          ];
    if (opts?.asyncify) {
        args.push('--asyncify');
    }

    // process core Wasm modules with wasm-opt
    await Promise.all(
        coreModules.map(async (metadata) => {
            if (metadata.metaType.tag === 'module') {
                // store the wasm-opt processed module in the metadata
                metadata.optimized = await runWasmOptCLI(
                    componentBytes.subarray(
                        metadata.range[0],
                        metadata.range[1]
                    ),
                    args
                );

                // compute the size change, including the change to
                // the LEB128 encoding of the size change
                const prevModuleSize = metadata.range[1] - metadata.range[0];
                const newModuleSize = metadata.optimized.byteLength;
                metadata.newLEBLen = byteLengthLEB128(newModuleSize);
                metadata.sizeChange = newModuleSize - prevModuleSize;
            }
        })
    );

    // organize components in modules into tree parent and children
    const nodes = componentMetadata.slice(1);
    const getChildren = (parentIndex) => {
        const children = [];
        for (let i = 0; i < nodes.length; i++) {
            const metadata = nodes[i];
            if (metadata.parentIndex === parentIndex) {
                nodes.splice(i, 1); // remove from nodes
                i--;
                metadata.children = getChildren(metadata.index);
                metadata.sizeChange = metadata.children.reduce(
                    (total, { prevLEBLen, newLEBLen, sizeChange }) => {
                        return sizeChange
                            ? total + sizeChange + newLEBLen - prevLEBLen
                            : total;
                    },
                    metadata.sizeChange || 0
                );
                const prevSize = metadata.range[1] - metadata.range[0];
                metadata.newLEBLen = byteLengthLEB128(
                    prevSize + metadata.sizeChange
                );
                children.push(metadata);
            }
        }
        return children;
    };
    const componentTree = getChildren(0);

    // compute the total size change in the component binary
    const sizeChange = componentTree.reduce(
        (total, { prevLEBLen, newLEBLen, sizeChange }) => {
            return total + (sizeChange || 0) + newLEBLen - prevLEBLen;
        },
        0
    );

    let outComponentBytes = new Uint8Array(
        componentBytes.byteLength + sizeChange
    );
    let nextReadPos = 0,
        nextWritePos = 0;

    const write = ({ prevLEBLen, range, optimized, children, sizeChange }) => {
        // write from the last read to the LEB byte start
        outComponentBytes.set(
            componentBytes.subarray(nextReadPos, range[0] - prevLEBLen),
            nextWritePos
        );
        nextWritePos += range[0] - prevLEBLen - nextReadPos;

        // write the new LEB bytes
        let val = range[1] - range[0] + sizeChange;
        do {
            const byte = val & 0x7f;
            val >>>= 7;
            outComponentBytes[nextWritePos++] = val === 0 ? byte : byte | 0x80;
        } while (val !== 0);

        if (optimized) {
            // write the core module
            outComponentBytes.set(optimized, nextWritePos);
            nextReadPos = range[1];
            nextWritePos += optimized.byteLength;
        } else if (children.length > 0) {
            // write child components / modules
            nextReadPos = range[0];
            children.forEach(write);
        } else {
            // write component
            outComponentBytes.set(
                componentBytes.subarray(range[0], range[1]),
                nextWritePos
            );
            nextReadPos = range[1];
            nextWritePos += range[1] - range[0];
        }
    };

    // write each top-level component / module
    componentTree.forEach(write);

    // write remaining
    outComponentBytes.set(componentBytes.subarray(nextReadPos), nextWritePos);

    // verify it still parses ok
    if (!opts?.noVerify) {
        try {
            print(outComponentBytes);
        } catch (e) {
            throw new Error(
                `Internal error performing optimization.\n${e.message}`
            );
        }
    }

    return {
        component: outComponentBytes,
        compressionInfo: coreModules.map(({ range, optimized }) => ({
            beforeBytes: range[1] - range[0],
            afterBytes: optimized?.byteLength,
        })),
    };
}

/**
 * Run wasm-opt on a given component
 *
 * @param {Uint8Array} source
 * @param {Array<string>} args
 * @returns {Promise<Uint8Array>}
 */
async function runWasmOptCLI(
    source: Uint8Array,
    args: string[]
): Promise<Uint8Array> {
    const wasmOptPath = fileURLToPath(
        import.meta.resolve('binaryen/bin/wasm-opt')
    );

    try {
        return await runWASMTransformProgram(wasmOptPath, source, [
            ...args,
            '-o',
        ]);
    } catch (e) {
        if (e.toString().includes('BasicBlock requested')) {
            return wasmOpt(source, args);
        }
        throw e;
    }
}

// see: https://github.com/vitest-dev/vitest/issues/6953#issuecomment-2505310022
if (typeof __vite_ssr_import_meta__ !== 'undefined') {
    __vite_ssr_import_meta__.resolve = (path) =>
        'file://' + globalCreateRequire(import.meta.url).resolve(path);
}
