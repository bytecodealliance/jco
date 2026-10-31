// Constructor instrumentation is isolated from every timing process.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export async function main(moduleUrl, outputPath) {
    const counts = {};
    const originals = {};

    // Install instrumentation only while this probe runs.
    try {
        for (const key of [
            'Map',
            'Int32Array',
            'Float32Array',
            'BigInt64Array',
            'Float64Array',
            'TextEncoder',
            'TextDecoder',
        ]) {
            const original = globalThis[key];
            originals[key] = original;
            counts[key] = 0;
            globalThis[key] = new Proxy(original, {
                construct(target, args, receiver) {
                    counts[key]++;
                    return Reflect.construct(target, args, receiver);
                },
            });
        }

        // Load the bundle and verify its observable result.
        const { answer } = await import(moduleUrl);
        assert.equal(answer(), 42);

        await writeFile(outputPath, JSON.stringify(counts));
    } finally {
        // Restore constructors even when importing or validating the probe fails.
        Object.assign(globalThis, originals);
    }
}

if (import.meta.main ?? (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)) {
    const args = process.argv.slice(2);
    assert.equal(args.length, 2, 'Usage: trace.mjs <module-url> <output.json>');

    await main(...args);
}
