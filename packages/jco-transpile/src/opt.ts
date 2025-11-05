import { fileURLToPath } from 'node:url';

import { byteLengthLEB128, runWASMTransformProgram } from './common.js';

import { $init, tools } from '../vendor/wasm-tools.js';
import type { ModuleMetadata } from '../vendor/interfaces/local-wasm-tools-tools.js';
const { metadataShow, print } = tools;

export interface OptimizeOptions {
    quiet: boolean;
    asyncify?: boolean;
    optArgs?: string[];
    noVerify?: boolean;
    wasmOptBin?: string;
};

interface CompressionInfo {
    beforeBytes: number;
    afterBytes: number | undefined;
}

interface OptimizeResult {
    component: Uint8Array;
    compressionInfo: CompressionInfo[];
}

interface EnhancedModuleMetadata extends ModuleMetadata {
    index?: number;
    prevLEBLen?: number;
    newLEBLen?: number;
    optimized?: Uint8Array;
    children?: EnhancedModuleMetadata[],
    sizeChange?: number,
};

/**
 * Perform optimization for a given component
 *
 * @param componentBytes - WebAssembly component bytes
 * @param [opts] - options for optimization
 * @returns A `Promise` that resolves to the optimization results
 */
export async function runOptimizeComponent(
    componentBytes: Uint8Array,
    opts?: OptimizeOptions
): Promise<OptimizeResult> {
    await $init;

    const componentMetadata = metadataShow(componentBytes);
    componentMetadata.forEach((metadata, index) => {
        (metadata as EnhancedModuleMetadata).index = index;
        const size = metadata.range[1] - metadata.range[0];
        (metadata as EnhancedModuleMetadata).prevLEBLen = byteLengthLEB128(size);
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
                const optimized = await runWasmOptCLI(
                    componentBytes.subarray(
                        metadata.range[0],
                        metadata.range[1]
                    ),
                    args,
                    opts
                );
                if (optimized === null) { throw new Error('failed to optimize binary with wasm-opt'); }

                // compute the size change, including the change to
                // the LEB128 encoding of the size change
                const prevModuleSize = metadata.range[1] - metadata.range[0];
                const newModuleSize = optimized.byteLength;
                (metadata as EnhancedModuleMetadata).newLEBLen = byteLengthLEB128(newModuleSize);
                (metadata as EnhancedModuleMetadata).sizeChange = newModuleSize - prevModuleSize;
                (metadata as EnhancedModuleMetadata).optimized = optimized;
            }
        })
    );

    // organize components in modules into tree parent and children
    const nodes = componentMetadata.slice(1);
    const getChildren = (parentIndex: number) => {
        const children = [];
        for (let i = 0; i < nodes.length; i++) {
            const metadata = nodes[i];
            if (metadata.parentIndex === parentIndex) {
                nodes.splice(i, 1); // remove from nodes
                i--;
                const idx = (metadata as EnhancedModuleMetadata).index;

                if (idx === undefined) { throw new Error('unexpectedly missing index on module metadata'); }
                (metadata as EnhancedModuleMetadata).children = getChildren(idx);

                (metadata as EnhancedModuleMetadata).sizeChange = ((metadata as EnhancedModuleMetadata).children ?? []).reduce(
                    (total, childMetadata) => {
                        const { prevLEBLen, newLEBLen, sizeChange } = childMetadata;
                        if (newLEBLen === undefined) { throw new Error("unexpectedly undefined new LEB len"); }
                        if (prevLEBLen === undefined) { throw new Error("unexpectedly undefined new LEB len"); }
                        return sizeChange
                            ? total + sizeChange + newLEBLen - prevLEBLen
                            : total;
                    },
                    (metadata as EnhancedModuleMetadata).sizeChange || 0
                );
                const prevSize = metadata.range[1] - metadata.range[0];

                (metadata as EnhancedModuleMetadata).newLEBLen = byteLengthLEB128(
                    prevSize + ((metadata as EnhancedModuleMetadata).sizeChange ?? 0)
                );
                children.push(metadata);
            }
        }
        return children;
    };
    const componentTree = getChildren(0);

    // compute the total size change in the component binary
    const sizeChange = componentTree.reduce(
        (total, metadata) => {
            const { prevLEBLen, newLEBLen, sizeChange } = metadata as EnhancedModuleMetadata;
            if (newLEBLen === undefined) { throw new Error("unexpectedly undefined new LEB len"); }
            if (prevLEBLen === undefined) { throw new Error("unexpectedly undefined new LEB len"); }
            return total + (sizeChange || 0) + newLEBLen - prevLEBLen;
        },
        0
    );

    const outComponentBytes = new Uint8Array(
        componentBytes.byteLength + sizeChange
    );
    let nextReadPos = 0,
        nextWritePos = 0;

    const write = (metadata: EnhancedModuleMetadata) => {
        const { prevLEBLen, range, optimized, children, sizeChange } = metadata as EnhancedModuleMetadata;
        if (prevLEBLen === undefined) { throw new Error("unexpectedly undefined prev LEB len"); }
        if (sizeChange === undefined) { throw new Error("unexpectedly undefined sizeChange"); }

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
        } else if (children && children.length > 0) {
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
    componentTree.forEach(metadata => write(metadata as EnhancedModuleMetadata));

    // write remaining
    outComponentBytes.set(componentBytes.subarray(nextReadPos), nextWritePos);

    // verify it still parses ok
    if (!opts?.noVerify) {
        try {
            print(outComponentBytes);
        } catch (e) {
            throw new Error(
                `Internal error performing optimization.\n${e instanceof Error ? e.message : ""}`
            );
        }
    }

    return {
        component: outComponentBytes,
        compressionInfo: coreModules.map((metadata) => {
            const optimized = (metadata as EnhancedModuleMetadata).optimized;
            if (!optimized) { throw new Error('unexpectedly missing optimized chunk'); }
            return {
                beforeBytes: metadata.range[1] - metadata.range[0],
                afterBytes: optimized.byteLength,
            };
        }),
    };
}

/** Options for `runWasmOptCLI()` */
interface RunWasmOptCLIOptions {
    wasmOptBin?: string;
}

/**
 * Run wasm-opt on a given component
 *
 * @param source - WebAssembly binary bytes
 * @param args - arguments to use with wasm-opt
 * @param opts - options for controlling wasm-opt run
 * @returns {Promise<Uint8Array>}
 */
async function runWasmOptCLI(
    source: Uint8Array,
    args: string[] ,
    opts?: RunWasmOptCLIOptions,
): Promise<Uint8Array | null> {
    const wasmOptBin =
        opts?.wasmOptBin ??
        fileURLToPath(import.meta.resolve('binaryen/bin/wasm-opt'));

    try {
        return await runWASMTransformProgram(wasmOptBin, source, [
            ...args,
            '-o',
        ]);
    } catch (e) {
        if ((typeof e === 'string' || e instanceof Error) && e.toString().includes('BasicBlock requested')) {
            return runWasmOptCLI(source, args, opts);
        }
        throw e;
    }
}
