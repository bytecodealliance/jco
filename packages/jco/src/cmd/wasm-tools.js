import { resolve, basename, extname } from "node:path";
import { writeFile } from "node:fs/promises";

import {
    print as printFn,
    parse as parseFn,
    componentWit as componentWitFn,
    componentNew as componentNewFn,
    componentEmbed as componentEmbedFn,
    metadataAdd as metadataAddFn,
    metadataShow as metadataShowFn,
} from "@bytecodealliance/jco-transpile/wasm-tools";

import { readFile, isWindows, styleText } from "../common.js";

export async function parse(file, opts) {
    const source = (await readFile(file)).toString();
    const output = await parseFn(source);
    await writeFile(opts.output, output);
}

export async function print(file, opts) {
    const source = await readFile(file);
    const output = await printFn(source);
    if (opts.output) {
        await writeFile(opts.output, output);
    } else {
        console.log(output);
    }
}

export async function componentWit(file, opts) {
    const source = await readFile(file);
    const output = await componentWitFn(source, opts.document);
    if (opts.output) {
        await writeFile(opts.output, output);
    } else {
        console.log(output);
    }
}

export async function componentNew(file, opts) {
    const source = file ? await readFile(file) : null;
    let adapters = [];
    if (opts.wasiReactor && opts.wasiCommand) {
        throw new Error("Must select one of --wasi-command or --wasi-reactor");
    }
    if (opts.wasiReactor) {
        adapters = [
            [
                "wasi_snapshot_preview1",
                (await readFile(new URL("../../lib/wasi_snapshot_preview1.reactor.wasm", import.meta.url))).buffer,
            ],
        ];
    } else if (opts.wasiCommand) {
        adapters = [
            [
                "wasi_snapshot_preview1",
                (await readFile(new URL("../../lib/wasi_snapshot_preview1.command.wasm", import.meta.url))).buffer,
            ],
        ];
    }
    if (opts.adapt) {
        adapters = adapters.concat(
            await Promise.all(
                opts.adapt.map(async (adapt) => {
                    let adapter;
                    if (adapt.includes("=")) {
                        adapter = adapt.split("=");
                    } else {
                        adapter = [basename(adapt).slice(0, -extname(adapt).length), adapt];
                    }
                    adapter[1] = await readFile(adapter[1]);
                    return adapter;
                }),
            ),
        );
    }
    const output = await componentNewFn(source, adapters);
    await writeFile(opts.output, output);
}

export async function componentEmbed(file, opts) {
    if (opts.metadata) {
        opts.metadata = opts.metadata.map((meta) => {
            const [field, data = ""] = meta.split("=");
            const [name, version = ""] = data.split("@");
            return [field, [[name, version]]];
        });
    }
    const source = file ? await readFile(file) : null;
    opts.binary = source;
    opts.witPath = (isWindows ? "//?/" : "") + resolve(opts.wit);
    const output = await componentEmbedFn(opts);
    await writeFile(opts.output, output);
}

export async function metadataAdd(file, opts) {
    const metadata = opts.metadata.map((meta) => {
        const [field, data = ""] = meta.split("=");
        const [name, version = ""] = data.split("@");
        return [field, [[name, version]]];
    });
    const source = await readFile(file);
    const output = await metadataAddFn(source, metadata);
    await writeFile(opts.output, output);
}

export async function metadataShow(file, opts) {
    const source = await readFile(file);
    let output = "",
        stack = [1];
    const meta = await metadataShowFn(source);
    if (opts.json) {
        console.log(JSON.stringify(meta, null, 2));
    } else {
        for (const { name, metaType, producers } of meta) {
            output += "  ".repeat(stack.length - 1);
            const indent = "  ".repeat(stack.length);
            if (metaType.tag === "component") {
                output += `${styleText("bold", `[component${name ? " " + name : ""}]`)}\n`;
                if (metaType.val > 0) {
                    stack.push(metaType.val);
                }
            } else {
                output += `${styleText("bold", `[module${name ? " " + name : ""}]`)}\n`;
            }
            if (producers.length === 0) {
                output += `${indent}(no metadata)\n`;
            }
            for (const [field, items] of producers) {
                for (const [name, version] of items) {
                    output += `${indent}${(field + ":").padEnd(13, " ")} ${name}${version ? `${styleText("cyan", version)}` : ""}\n`;
                }
            }
            output += "\n";
            if (stack[stack.length - 1] === 0) {
                stack.pop();
            }
            stack[stack.length - 1]--;
        }
        process.stdout.write(output);
    }
}
