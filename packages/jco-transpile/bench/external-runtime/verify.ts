import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { assert } from 'vitest';
import { installRuntime, optimize, type Artifact } from './build.js';
import { importControls, type Bundler, type ComponentId, type Resolution } from './cases.js';
import { measure } from './measure.js';
import { defaultRuntimeUrl } from '../../test/transpilation.js';

const exec = promisify(execFile);

/** Read the coverage declaration and check it against the built runtime API. */
export async function readRuntimeCoverage() {
    const coverage: { apiVersion: number; mapped: string[] } = JSON.parse(
        await readFile(new URL('./coverage.json', import.meta.url), 'utf8'),
    );
    const runtime = await import(new URL('runtime.js', defaultRuntimeUrl).href);
    assert.equal(coverage.apiVersion, runtime.CM_RUNTIME_API_VERSION);
    assert.include(coverage.mapped, 'Resource(ResourceTableGet)');
    assert.equal(new Set(coverage.mapped).size, coverage.mapped.length);
    return coverage;
}

/** Build import controls, check tree shaking and allocation counts, and retain their report data. */
export async function verifyImportControls(dir: string, bundler: Bundler, resolution: Resolution) {
    await mkdir(dir, { recursive: true });
    await installRuntime(dir);
    const controls = [];

    for (const control of importControls) {
        const groups = [control, ...('imports' in control ? control.imports : [])];
        const imports = groups
            .map((group) => {
                const specifier =
                    resolution === 'file'
                        ? new URL(group.suffix + '.js', defaultRuntimeUrl).href
                        : '@bytecodealliance/jco-cm-runtime/' + group.suffix;
                return `import { ${group.names.join(', ')} } from ${JSON.stringify(specifier)};`;
            })
            .join('\n');

        for (const used of [false, true]) {
            const entry = join(dir, `entry-${control.id}-${used}.mjs`);
            await writeFile(
                entry,
                imports +
                    '\n' +
                    (used
                        ? control.setup + ` export function answer() { return ${control.answer}; }`
                        : 'export const answer = 42;'),
            );
            const result = await optimize(entry, bundler);
            const bundle = join(dir, `bundle-${control.id}-${used}.mjs`);
            await writeFile(bundle, result.code);
            const binding = await import(pathToFileURL(bundle).href);
            assert.equal(used ? binding.answer() : binding.answer, 42);
            if (!used) {
                assert.isBelow(Buffer.byteLength(result.code), 100);
            }

            let allocations: Record<string, number> | undefined;
            if (used) {
                const trace = join(dir, `allocations-${control.id}.json`);
                await exec(process.execPath, [
                    fileURLToPath(new URL('./trace.mjs', import.meta.url)),
                    pathToFileURL(bundle).href,
                    trace,
                ]);
                allocations = JSON.parse(await readFile(trace, 'utf8')) as Record<string, number>;
                const expected = Object.fromEntries(
                    Object.keys(allocations).map((key) => [
                        key,
                        (control.allocations as Record<string, number>)[key] ?? 0,
                    ]),
                );
                assert.deepEqual(allocations, expected, `${control.id} must initialize only selected storage`);
            }

            controls.push({
                bundler,
                resolution,
                operation: control.id,
                used,
                bytes: Buffer.byteLength(result.code),
                modules: result.modules,
                allocations,
            });
        }
    }

    return controls;
}

/** Verify the exact inline/external artifacts that will be used for measurements. */
export async function verifyPair(
    pair: { inline: Artifact; external: Artifact },
    scenario: { id: string; components: readonly ComponentId[] },
) {
    if (scenario.id === 'strings') {
        assert.isTrue(pair.external.graph.contexts.some((line) => line.includes('_jcoInitializeUtf8Encoder()')));
        assert.isTrue(pair.external.graph.contexts.some((line) => line.includes('_jcoInitializeUtf8Decoder()')));
    }
    assert.deepEqual(pair.inline.wasm, pair.external.wasm);
    assert.deepEqual(pair.inline.fixtureDigests, pair.external.fixtureDigests);
    const checked = await measure(pair, true);
    assert.deepEqual(checked.verified, [...scenario.components]);

    if (scenario.id === 'empty' || scenario.id === 'noise') {
        assert.equal(await readFile(pair.inline.bundle, 'utf8'), await readFile(pair.external.bundle, 'utf8'));
    }
}
