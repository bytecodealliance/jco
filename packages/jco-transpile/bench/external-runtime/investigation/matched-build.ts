import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { link, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { buildArtifact, type Artifact, type ArtifactBuildOptions } from '../build.js';
import { bundlers, fullScenarios, resolutions } from '../cases.js';
import { assertCompleteReports, expectedReportIds } from '../matrix.mjs';
import { measureMatched } from './matched-measure.js';
import { validateCoverage } from './matched-protocol.mjs';
import { sourceHashes } from '../provenance.js';

const exec = promisify(execFile);
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const fileHash = async (file: string | URL) => hash(await readFile(file));
export const matchedModes = ['old-inline', 'inline', 'factory', 'named'] as const;
export type MatchedMode = (typeof matchedModes)[number];
export interface Producer {
    binary: string;
    sha256: string;
    runtimePackage: string;
}
export interface MatchedInputs {
    factoryRef: string;
    factory: Producer;
    named: Producer;
    productionManifest: string;
}
export interface MatchedGraph {
    id: string;
    bundler: (typeof bundlers)[number];
    resolution: (typeof resolutions)[number];
    scenario: string;
    artifacts: Record<MatchedMode, Artifact>;
}

async function filesUnder(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    return (
        await Promise.all(
            entries.map(async (entry) =>
                entry.isDirectory()
                    ? (await filesUnder(join(dir, entry.name))).map((name) => join(entry.name, name))
                    : entry.isFile()
                      ? [entry.name]
                      : [],
            ),
        )
    )
        .flat()
        .sort();
}
async function runtimeSnapshot(dir: string) {
    const metadata = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    assert.equal(metadata.name, '@bytecodealliance/jco-cm-runtime');
    return {
        metadata,
        hashes: Object.fromEntries(
            await Promise.all(
                ['package.json', ...(await filesUnder(join(dir, 'dist'))).map((name) => join('dist', name))].map(
                    async (name) => [name, await fileHash(join(dir, name))],
                ),
            ),
        ),
    };
}

/** Builds and verifies every artifact before any matched timing is permitted. */
export async function buildMatchedMatrix(inputs: MatchedInputs, output: string) {
    assert.equal(inputs.factoryRef, 'b5931a41f6222359628b451e647078ab2e04d536');
    const production = JSON.parse(await readFile(inputs.productionManifest, 'utf8')) as {
        settings: { portfolio: string; coverage: { mapped: string[] } };
        environment: {
            compilerArtifacts: Record<string, string>;
            runtimeArtifacts: Record<string, string>;
            bindingSourceHashes: Record<string, string>;
        };
        graphs: { id: string; pair: { inline: Artifact; external: Artifact } }[];
    };
    assert.equal(production.settings.portfolio, 'full');
    const coverage = JSON.parse(await readFile(new URL('../coverage.json', import.meta.url), 'utf8'));
    const historical = JSON.parse(
        await readFile(new URL('../checkpoints/n12-coverage-audit.json', import.meta.url), 'utf8'),
    );
    validateCoverage(coverage, production.settings.coverage);
    const bindingSourceHashes = await sourceHashes(
        new URL('../../../../../crates/js-component-bindgen/src/', import.meta.url),
    );
    assert.deepEqual(
        production.environment.bindingSourceHashes,
        bindingSourceHashes,
        'production manifest must match the selected trait-runtime sources',
    );
    assertCompleteReports(expectedReportIds('full'), Object.fromEntries(production.graphs.map((g) => [g.id, g])));
    const selected = {
        factory: {
            ...inputs.factory,
            binary: await realpath(inputs.factory.binary),
            runtimePackage: await realpath(inputs.factory.runtimePackage),
        },
        named: {
            ...inputs.named,
            binary: await realpath(inputs.named.binary),
            runtimePackage: await realpath(inputs.named.runtimePackage),
        },
    };
    const runtimes = {
        factory: await runtimeSnapshot(selected.factory.runtimePackage),
        named: await runtimeSnapshot(selected.named.runtimePackage),
    };
    for (const profile of Object.values(selected)) {
        assert.equal(await fileHash(profile.binary), profile.sha256, 'producer binary changed');
    }
    for (const [name, digest] of Object.entries(production.environment.compilerArtifacts)) {
        assert.equal(await fileHash(new URL('../../../vendor/' + name, import.meta.url)), digest, name);
    }
    for (const [name, digest] of Object.entries(production.environment.runtimeArtifacts)) {
        assert.equal(runtimes.named.hashes[name === 'package' ? 'package.json' : join('dist', name)], digest, name);
    }
    // Never reuse an existing directory or overwrite another attempt's evidence.
    await mkdir(output);
    await writeFile(join(output, 'package.json'), '{"type":"module"}\n', { flag: 'wx' });
    const graphs: MatchedGraph[] = [];
    const generated = new Map<string, { files: Record<string, Uint8Array> }>();
    const identical = new Map<string, string>();
    let nativeParts = 0;
    async function consolidate(dir: string) {
        // Completed artifacts are immutable. Skip package symlinks; share only
        // byte-identical regular files within this newly owned attempt.
        for (const name of await filesUnder(dir)) {
            const file = join(dir, name);
            const key = `${(await stat(file)).mode}:${await fileHash(file)}`;
            const prior = identical.get(key);
            if (prior) {
                await link(prior, file + '.same-bytes');
                await rename(file + '.same-bytes', file);
            } else {
                identical.set(key, file);
            }
        }
    }
    async function options(profile: 'factory' | 'named'): Promise<ArtifactBuildOptions> {
        const producer = selected[profile];
        return {
            runtimePackageDirectory: producer.runtimePackage,
            runtimeFileSpecifier: pathToFileURL(
                join(producer.runtimePackage, profile === 'factory' ? 'dist/index.js' : 'dist') +
                    (profile === 'named' ? sep : ''),
            ).href,
            async generate(fixture, name, runtimeSpecifier) {
                const key = JSON.stringify([profile, fixture, name, runtimeSpecifier ?? null]);
                const cached = generated.get(key);
                if (cached) {
                    return cached;
                }
                const dir = join(output, 'producer-scratch');
                await mkdir(dir);
                try {
                    await exec(producer.binary, [fixture, dir, name, ...(runtimeSpecifier ? [runtimeSpecifier] : [])], {
                        timeout: 120_000,
                        maxBuffer: 4 * 1024 * 1024,
                    });
                    const result = {
                        files: Object.fromEntries(
                            await Promise.all(
                                (await filesUnder(dir)).map(async (file) => [
                                    file,
                                    new Uint8Array(await readFile(join(dir, file))),
                                ]),
                            ),
                        ),
                    };
                    generated.set(key, result);
                    nativeParts++;
                    return result;
                } finally {
                    await rm(dir, { recursive: true, force: true });
                }
            },
        };
    }
    try {
        for (const bundler of bundlers) {
            for (const resolution of resolutions) {
                for (const scenario of fullScenarios) {
                    const id = `${bundler}--${resolution}--${scenario.id}`;
                    const reference = production.graphs.find((g) => g.id === id)!.pair;
                    const artifacts = {} as Record<MatchedMode, Artifact>;
                    for (const mode of matchedModes) {
                        const profile = mode === 'factory' || mode === 'old-inline' ? 'factory' : 'named';
                        const external = mode === 'factory' || mode === 'named';
                        const artifact = await buildArtifact(
                            join(output, id, mode),
                            external ? 'external' : 'inline',
                            scenario.components,
                            bundler,
                            resolution,
                            await options(profile),
                        );
                        assert.deepEqual(artifact.wasm, reference.inline.wasm, `${id}/${mode}: identical core Wasm`);
                        assert.deepEqual(
                            artifact.fixtureDigests,
                            reference.inline.fixtureDigests,
                            `${id}/${mode}: identical fixtures`,
                        );
                        if (profile === 'named') {
                            const control = reference[external ? 'external' : 'inline'];
                            for (const name of (await filesUnder(control.dir)).filter((n) =>
                                n.startsWith('parts' + sep),
                            )) {
                                assert.equal(
                                    await fileHash(join(artifact.dir, name)),
                                    await fileHash(join(control.dir, name)),
                                    `${id}/${mode}/${name}: production Node API parity`,
                                );
                            }
                            assert.equal(
                                await fileHash(artifact.bundle),
                                await fileHash(control.bundle),
                                `${id}/${mode}: production bundle parity`,
                            );
                        }
                        const runtimeFiles = Object.keys(artifact.retainedModules).filter(
                            (file) => file.includes('jco-cm-runtime') && !file.startsWith(artifact.dir + sep),
                        );
                        assert.ok(
                            runtimeFiles.every((file) => file.startsWith(selected[profile].runtimePackage + sep)),
                            `${id}/${mode}: mixed runtime graph`,
                        );
                        await consolidate(artifact.dir);
                        artifacts[mode] = artifact;
                    }
                    const checked = await measureMatched(artifacts, true);
                    assert.deepEqual(checked.verified, [...scenario.components]);
                    assert.deepEqual(checked.modes, [...matchedModes]);
                    assert.equal(checked.varyingInputs, 32);
                    graphs.push({ id, bundler, resolution, scenario: scenario.id, artifacts });
                    await writeFile(
                        join(output, 'progress.json'),
                        JSON.stringify({ status: 'building', graphs: graphs.length, expected: 68 }),
                    );
                }
            }
        }
        assertCompleteReports(expectedReportIds('full'), Object.fromEntries(graphs.map((g) => [g.id, g])));
        for (const profile of ['factory', 'named'] as const) {
            assert.equal(await fileHash(selected[profile].binary), selected[profile].sha256);
            assert.deepEqual(
                await runtimeSnapshot(selected[profile].runtimePackage),
                runtimes[profile],
                'runtime changed during build',
            );
        }
        const result = {
            schema: 1,
            status: 'verified-inputs',
            timingCollected: false,
            inputs: selected,
            factoryRef: inputs.factoryRef,
            productionManifest: resolve(inputs.productionManifest),
            productionManifestSha256: await fileHash(inputs.productionManifest),
            coverage,
            factoryCoverage: historical.historicalMapped,
            bindingSourceHashes,
            runtimes,
            nativeParts,
            modes: matchedModes,
            graphs,
        };
        await writeFile(join(output, 'manifest.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
        return result;
    } catch (error) {
        await writeFile(
            join(output, 'failure.json'),
            JSON.stringify(
                { at: new Date().toISOString(), completedGraphs: graphs.length, error: String(error) },
                null,
                2,
            ) + '\n',
        );
        throw error;
    }
}
