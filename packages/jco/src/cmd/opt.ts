import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";

import { metadataShow, print } from "@bytecodealliance/jco-transpile/wasm-tools";

import { readFile, sizeStr, fixedDigitDisplay, table, spawnIOTmp } from "../common.js";

import { styleText } from "../common.js";

declare const __vite_ssr_import_meta__: ImportMeta;
declare const globalCreateRequire: typeof import("node:module").createRequire;

export interface OptimizeOptions {
    quiet: boolean;
    asyncify?: boolean;
    optArgs?: string[];
    noVerify?: boolean;
    wasmOptBin?: string;
}

export interface OptimizeResult {
    component: Uint8Array;
    compressionInfo: Array<{
        beforeBytes: number;
        afterBytes: number;
    }>;
}

export async function opt(componentPath: string, opts: OptimizeOptions & { output: string }, program: any) {
    const varIdx = program.parent.rawArgs.indexOf("--");
    if (varIdx !== -1) {
        opts.optArgs = program.parent.rawArgs.slice(varIdx + 1);
    }
    const componentBytes = await readFile(componentPath);

    const { component, compressionInfo } = await optimizeComponent(componentBytes, opts);

    await writeFile(opts.output, component);

    let totalBeforeBytes = 0,
        totalAfterBytes = 0;

    if (!opts.quiet) {
        const tableContent = table(
            [
                ...compressionInfo.map(({ beforeBytes, afterBytes }, i) => {
                    const actualAfterBytes = afterBytes!;
                    totalBeforeBytes += beforeBytes;
                    totalAfterBytes += actualAfterBytes;
                    return [
                        ` - Core Module ${i + 1}:  `,
                        sizeStr(beforeBytes),
                        " -> ",
                        `${styleText("cyan", sizeStr(actualAfterBytes))} `,
                        `(${fixedDigitDisplay((actualAfterBytes / beforeBytes) * 100, 2)}%)`,
                    ];
                }),
                ["", "", "", "", ""],
                [
                    ` = Total:  `,
                    `${sizeStr(totalBeforeBytes)}`,
                    ` => `,
                    `${styleText("cyan", sizeStr(totalAfterBytes))} `,
                    `(${fixedDigitDisplay((totalAfterBytes / totalBeforeBytes) * 100, 2)}%)`,
                ],
            ],
            [, , , , "right"],
        );

        console.log(`
${styleText("bold", "Optimized WebAssembly Component Internal Core Modules:")}

${tableContent}`);
    }
}

/**
 * Counts the byte length for the LEB128 encoding of a number.
 * @param {number} val
 * @returns {number}
 */
function byteLengthLEB128(val: number): number {
    let len = 0;
    do {
        val >>>= 7;
        len++;
    } while (val !== 0);
    return len;
}

/**
 *
 * @param {Uint8Array} componentBytes
 * @param {{ quiet: boolean, asyncify?: boolean, optArgs?: string[], noVerify?: boolean }} opts?
 * @returns {Promise<{ component: Uint8Array, compressionInfo: { beforeBytes: number, afterBytes: number }[] >}
 */
export async function optimizeComponent(componentBytes: Uint8Array, opts: OptimizeOptions): Promise<OptimizeResult> {
    let componentMetadata = (await metadataShow(componentBytes)) as Array<
        Awaited<ReturnType<typeof metadataShow>>[number] & {
            index?: number;
            prevLEBLen?: number;
            optimized?: Uint8Array;
            newLEBLen?: number;
            sizeChange?: number;
            children?: any[];
        }
    >;
    componentMetadata.forEach((metadata, index) => {
        // add index to the metadata object
        metadata.index = index;
        const size = metadata.range[1] - metadata.range[0];
        // compute previous LEB128 encoding length
        metadata.prevLEBLen = byteLengthLEB128(size);
    });
    const coreModules = componentMetadata.filter(({ metaType }) => metaType.tag === "module");

    // gather the options for wasm-opt. optionally, adding the asyncify flag
    const args = opts?.optArgs
        ? [...opts.optArgs]
        : ["-Oz", "--low-memory-unused", "--enable-bulk-memory", "--strip-debug"];
    if (opts?.asyncify) {
        args.push("--asyncify");
    }

    // process core Wasm modules with wasm-opt
    await Promise.all(
        coreModules.map(async (metadata) => {
            if (metadata.metaType.tag === "module") {
                // store the wasm-opt processed module in the metadata
                metadata.optimized = await wasmOpt(
                    componentBytes.subarray(metadata.range[0], metadata.range[1]),
                    args,
                    opts,
                );

                // compute the size change, including the change to
                // the LEB128 encoding of the size change
                const prevModuleSize = metadata.range[1] - metadata.range[0];
                const newModuleSize = metadata.optimized.byteLength;
                metadata.newLEBLen = byteLengthLEB128(newModuleSize);
                metadata.sizeChange = newModuleSize - prevModuleSize;
            }
        }),
    );

    // organize components in modules into tree parent and children
    const nodes = componentMetadata.slice(1);
    const getChildren = (parentIndex: number): any[] => {
        const children: any[] = [];
        for (let i = 0; i < nodes.length; i++) {
            const metadata = nodes[i];
            if (metadata.parentIndex === parentIndex) {
                nodes.splice(i, 1); // remove from nodes
                i--;
                metadata.children = getChildren(metadata.index!);
                metadata.sizeChange = metadata.children.reduce((total, { prevLEBLen, newLEBLen, sizeChange }) => {
                    return sizeChange ? total + sizeChange + newLEBLen - prevLEBLen : total;
                }, metadata.sizeChange || 0);
                const prevSize = metadata.range[1] - metadata.range[0];
                metadata.newLEBLen = byteLengthLEB128(prevSize + (metadata.sizeChange ?? 0));
                children.push(metadata);
            }
        }
        return children;
    };
    const componentTree = getChildren(0);

    // compute the total size change in the component binary
    const sizeChange = componentTree.reduce((total, { prevLEBLen, newLEBLen, sizeChange }) => {
        return total + (sizeChange || 0) + newLEBLen - prevLEBLen;
    }, 0);

    let outComponentBytes = new Uint8Array(componentBytes.byteLength + sizeChange);
    let nextReadPos = 0,
        nextWritePos = 0;

    const write = ({ prevLEBLen, range, optimized, children, sizeChange }: any) => {
        // write from the last read to the LEB byte start
        outComponentBytes.set(componentBytes.subarray(nextReadPos, range[0] - prevLEBLen), nextWritePos);
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
            outComponentBytes.set(componentBytes.subarray(range[0], range[1]), nextWritePos);
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
            await print(outComponentBytes);
        } catch (e) {
            throw new Error(`Internal error performing optimization.\n${(e as Error).message}`);
        }
    }

    return {
        component: outComponentBytes,
        compressionInfo: coreModules.map(({ range, optimized }) => ({
            beforeBytes: range[1] - range[0],
            afterBytes: optimized!.byteLength,
        })),
    };
}

/**
 * @param {Uint8Array} source
 * @param {Array<string>} args
 * @returns {Promise<Uint8Array>}
 */
async function wasmOpt(source: Uint8Array, args: string[], transpileOpts: OptimizeOptions): Promise<Uint8Array> {
    const wasmOptBin = transpileOpts?.wasmOptBin ?? fileURLToPath(import.meta.resolve("binaryen/bin/wasm-opt"));

    try {
        return await spawnIOTmp(wasmOptBin, source, [...args, "-o"]);
    } catch (e) {
        if ((e as Error).toString().includes("BasicBlock requested")) {
            return wasmOpt(source, args, transpileOpts);
        }
        throw e;
    }
}

// see: https://github.com/vitest-dev/vitest/issues/6953#issuecomment-2505310022
if (typeof __vite_ssr_import_meta__ !== "undefined") {
    __vite_ssr_import_meta__.resolve = (path) => "file://" + globalCreateRequire(import.meta.url).resolve(path);
}
