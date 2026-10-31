import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { rolldown } from 'rolldown';
import { rollup } from 'rollup';
import { minify } from 'oxc-minify';
import { componentPath, type Bundler, type ComponentId, type Resolution } from './cases.js';
import { defaultRuntimeUrl, transpile, writeFiles } from '../../test/transpilation.js';

const runtimeDirectory = resolve(fileURLToPath(defaultRuntimeUrl));
const runtimePackage = JSON.parse(await readFile(new URL('../package.json', defaultRuntimeUrl), 'utf8'));
// Match the package's published side-effects contract when resolving file URLs.
// Rollup's bare filesystem resolver otherwise has no package metadata to use.
const runtimeSideEffects = runtimePackage.sideEffects !== false;

export type Mode = 'inline' | 'external';
export interface Artifact {
    dir: string;
    bundle: string;
    parts: readonly ComponentId[];
    sourceBytes: number;
    graph: { imports: string[]; contexts: string[]; initializers: string[] };
    retainedModules: Record<string, number>;
    fixtureDigests: Record<string, string>;
    bundleMs: number;
    js: { raw: number; gzip: number; brotli: number };
    unshakenBytes: number;
    chunks: number;
    builtins: string[];
    wasm: { bytes: number; files: Record<string, string> };
}
/** Diagnostic overrides are opt-in; the regression suite uses the defaults. */
export interface BundleExperiment {
    minify?: boolean;
    assumePureReads?: boolean;
    define?: Record<string, string>;
    transform?: (code: string, id: string) => string;
    /** Isolated package under test; never substitute current metadata for a frozen runtime. */
    runtimePackageDirectory?: string;
}
export async function optimize(entry: string, bundler: Bundler, treeshake = true, experiment: BundleExperiment = {}) {
    let selectedDirectory = runtimeDirectory;
    let selectedSideEffects = runtimeSideEffects;
    if (experiment.runtimePackageDirectory) {
        const directory = await realpath(experiment.runtimePackageDirectory);
        const metadata = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
        if (metadata.name !== '@bytecodealliance/jco-cm-runtime') {
            throw new Error(`Unexpected runtime package: ${metadata.name}`);
        }
        selectedDirectory = join(directory, 'dist');
        selectedSideEffects = metadata.sideEffects !== false;
    }
    const options = {
        input: entry,
        treeshake:
            treeshake && experiment.assumePureReads
                ? { propertyReadSideEffects: false as const, unknownGlobalSideEffects: false }
                : treeshake,
        external: (id: string) => id.startsWith('node:'),
        plugins: [
            {
                name: 'runtime-file-urls',
                transform(code: string, id: string) {
                    return experiment.transform?.(code, id);
                },
                resolveId(id: string, importer?: string) {
                    if (
                        (id === '@bytecodealliance/jco-cm-runtime' ||
                            id.startsWith('@bytecodealliance/jco-cm-runtime/')) &&
                        importer
                    ) {
                        const path = createRequire(importer).resolve(id);
                        if (!path.startsWith(selectedDirectory + sep)) {
                            throw new Error(`Runtime resolved outside the selected package: ${path}`);
                        }
                        return { id: path, moduleSideEffects: selectedSideEffects };
                    }
                    const path = id.startsWith('file:')
                        ? fileURLToPath(id)
                        : isAbsolute(id)
                          ? id
                          : id.startsWith('.') && importer
                            ? resolve(dirname(importer), id)
                            : undefined;
                    if (path?.startsWith(selectedDirectory + sep)) {
                        return { id: path, moduleSideEffects: selectedSideEffects };
                    }
                    if (id.startsWith('file:')) {
                        return fileURLToPath(id);
                    }
                },
            },
        ],
        onwarn(warning: { code?: string; message: string }) {
            // Jco's marker is metadata, with no JavaScript runtime semantics.
            if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('use components')) {
                return;
            }
            throw new Error(warning.message);
        },
    };
    if (experiment.define && bundler !== 'rolldown') {
        throw new Error('The define experiment requires Rolldown');
    }
    const build =
        bundler === 'rolldown'
            ? await rolldown({ ...options, platform: 'node', transform: { define: experiment.define } })
            : await rollup(options);
    try {
        const generated = await build.generate(
            bundler === 'rolldown'
                ? { format: 'esm', minify: experiment.minify ?? true, codeSplitting: false }
                : { format: 'esm', inlineDynamicImports: true },
        );
        if (generated.output.length !== 1 || generated.output[0].type !== 'chunk') {
            throw new Error('Metrics require a single complete JavaScript bundle');
        }
        const chunk = generated.output[0];
        const imports = [...chunk.imports, ...chunk.dynamicImports];
        if (imports.some((id) => !id.startsWith('node:'))) {
            throw new Error(`Unbundled dependency would invalidate size measurements: ${imports.join(', ')}`);
        }
        const code =
            bundler === 'rolldown' || experiment.minify === false
                ? chunk.code
                : (
                      await minify('bundle.mjs', chunk.code, {
                          module: true,
                          compress: { target: 'es2022' },
                          mangle: {},
                      })
                  ).code;
        return {
            code,
            chunks: generated.output.length,
            builtins: imports.toSorted(),
            modules: Object.fromEntries(
                Object.entries(chunk.modules).map(([id, module]) => [id, module.renderedLength]),
            ),
        };
    } finally {
        await build.close();
    }
}
export interface ArtifactBuildOptions {
    runtimePackageDirectory?: string;
    runtimeFileSpecifier?: string;
    /** Diagnostic producer; defaults to the production Node API with the options below. */
    generate?: (
        fixture: string,
        name: string,
        runtimeSpecifier?: string,
    ) => Promise<{ files: Record<string, Uint8Array> }>;
}
export async function buildArtifact(
    dir: string,
    mode: Mode,
    parts: readonly ComponentId[],
    bundler: Bundler,
    resolution: Resolution,
    options: ArtifactBuildOptions = {},
): Promise<Artifact> {
    await mkdir(dir, { recursive: true });
    await installRuntime(dir, options.runtimePackageDirectory);
    const graph = { imports: [] as string[], contexts: [] as string[], initializers: [] as string[] };
    const fixtureDigests: Record<string, string> = {};
    const files: Record<string, string> = {};
    let wasmBytes = 0;
    let sourceBytes = 0;
    const exports: string[] = [];
    for (const [i, id] of parts.entries()) {
        const prefix = `parts/${i}`;
        const name = `component${i}`;
        const fixture = componentPath(id);
        fixtureDigests[id] = createHash('sha256')
            .update(await readFile(fixture))
            .digest('hex');
        const runtimeSpecifier =
            mode === 'external'
                ? resolution === 'file'
                    ? (options.runtimeFileSpecifier ?? defaultRuntimeUrl.href)
                    : '@bytecodealliance/jco-cm-runtime'
                : undefined;
        const result =
            id === 'noise'
                ? { files: { [`${name}.js`]: new Uint8Array(await readFile(fixture)) } }
                : options.generate
                  ? await options.generate(fixture, name, runtimeSpecifier)
                  : await transpile(fixture, {
                        name,
                        instantiation: 'sync',
                        wasiShim: false,
                        base64Cutoff: 0,
                        asyncMode: 'jspi',
                        cmRuntimeEsModule: runtimeSpecifier,
                    });
        const partDir = join(dir, prefix);
        await writeFiles(result.files, { baseDir: partDir });
        for (const [path, bytes] of Object.entries(result.files)) {
            if (path.endsWith('.js')) {
                sourceBytes += bytes.byteLength;
                const source = new TextDecoder().decode(bytes);
                graph.imports.push(...(source.match(/import \{[^}]+\} from [^;]+;/g) ?? []));
                const selectedInitializations = source.match(/const \w+\s*=\s*_jcoInitialize\w*\([^;]*\);/g) ?? [];
                graph.contexts.push(
                    ...new Set([...(source.match(/const _jco\w*Context\s*=.*;/g) ?? []), ...selectedInitializations]),
                );
                graph.initializers.push(
                    ...selectedInitializations,
                    ...(source.match(/(?:const|let) \w+ = (?:new \w+|create\w+|initialize\w+)\([^;]*;/g) ?? []),
                );
            }
            if (path.endsWith('.wasm')) {
                wasmBytes += bytes.byteLength;
                files[`${prefix}/${path}`] = createHash('sha256').update(bytes).digest('hex');
            }
        }
        exports.push(`import { instantiate as instantiate${i} } from './${prefix}/${name}.js';
export function create${i}(load, imports) { return instantiate${i}(name => load('${prefix}/' + name), imports); }`);
    }
    const entry = join(dir, 'entry.js');
    await writeFile(entry, exports.join('\n'));
    const start = performance.now();
    const experiment = { runtimePackageDirectory: options.runtimePackageDirectory };
    const result = await optimize(entry, bundler, true, experiment);
    const bundleMs = performance.now() - start;
    const unshaken = await optimize(entry, bundler, false, experiment);
    const bundle = join(dir, 'bundle.mjs');
    await writeFile(bundle, result.code);
    return {
        dir,
        bundle,
        parts,
        sourceBytes,
        graph,
        retainedModules: result.modules,
        fixtureDigests,
        bundleMs,
        js: {
            raw: Buffer.byteLength(result.code),
            gzip: gzipSync(result.code, { level: 9 }).byteLength,
            brotli: brotliCompressSync(result.code, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).byteLength,
        },
        unshakenBytes: Buffer.byteLength(unshaken.code),
        chunks: result.chunks,
        builtins: result.builtins,
        wasm: { bytes: wasmBytes, files },
    };
}
export async function installRuntime(dir: string, packageDirectory = dirname(runtimeDirectory)) {
    const namespace = join(dir, 'node_modules/@bytecodealliance');
    await mkdir(namespace, { recursive: true });
    await symlink(packageDirectory, join(namespace, 'jco-cm-runtime'), 'junction');
}

export async function buildPair(
    parts: readonly ComponentId[],
    bundler: Bundler,
    resolution: Resolution = 'file',
    outputRoot?: string,
) {
    const dir = await mkdtemp(join(outputRoot ?? tmpdir(), 'jco-external-runtime-bench-'));
    try {
        const inline = await buildArtifact(join(dir, 'inline'), 'inline', parts, bundler, resolution);
        const external = await buildArtifact(join(dir, 'external'), 'external', parts, bundler, resolution);
        return {
            inline,
            external,
            cleanup: () => (outputRoot ? Promise.resolve() : rm(dir, { recursive: true, force: true })),
        };
    } catch (error) {
        if (!outputRoot) {
            await rm(dir, { recursive: true, force: true });
        }
        throw error;
    }
}
export async function readBundle(artifact: Artifact) {
    return readFile(artifact.bundle, 'utf8');
}
