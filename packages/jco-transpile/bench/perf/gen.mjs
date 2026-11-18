/** Generate the bindings used to measure calls through a Component Model runtime. */
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [variant, runtime, ...extra] = process.argv.slice(2);
if (!variant || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(variant) || !runtime) {
    throw new Error('usage: node gen.mjs <variant-name> <runtime-directory | embedded> [transpile flags]');
}

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const fixtures = join(root, 'packages/jco-transpile/test/fixtures/components');
const output = fileURLToPath(new URL('../output/perf/', import.meta.url));
const hosts = new URL('./hosts.mjs', import.meta.url).href;
const transpiler = join(root, 'target/debug/examples', process.platform === 'win32' ? 'transpile.exe' : 'transpile');
const flags = ['cli', 'clocks', 'filesystem', 'io', 'random'].map(
    (name) => `--map=wasi:${name}/*=@bytecodealliance/preview2-shim/${name}#*`,
);
if (runtime !== 'embedded') {
    flags.push('--runtime=' + pathToFileURL(resolve(runtime)).href);
}

await mkdir(output, { recursive: true });
const staging = await mkdtemp(join(output, '.generate-'));

/** Write one fixture's bindings, forwarding each transpiler flag as a separate argument. */
function generate(fixture, name, fixtureFlags) {
    execFileSync(transpiler, [fixture, join(staging, name), ...flags, ...fixtureFlags, ...extra], {
        stdio: 'inherit',
    });
}

try {
    for (const name of ['numbers', 'strings', 'lists', 'records']) {
        generate(join(fixtures, `runtime/${name}.component.wasm`), name, [`--map=test:${name}/*=${hosts}#${name}`]);
    }
    for (const fixture of [
        'round-trip/async-round-trip-stackless',
        'streams/async-closed-streams',
        'general/async-readiness',
        'general/async-synchronous-transmit',
    ]) {
        generate(join(fixtures, `p3/${fixture}.wasm`), basename(fixture), [
            '--jspi',
            `--map=local:local/*=${hosts}#p3`,
        ]);
    }
    const component = join(staging, 'stream-pass-through.wasm');
    execFileSync('wasm-tools', ['parse', join(fixtures, 'p3/streams/stream-pass-through.wat'), '-o', component]);
    generate(component, 'stream-pass-through', ['--jspi']);
    await rm(component);

    // Two components with a memory each, whose calls copy through a fused adapter.
    const composed = join(staging, 'echo-composed.wasm');
    execFileSync('wasm-tools', [
        'parse',
        fileURLToPath(new URL('./echo-composed.wat', import.meta.url)),
        '-o',
        composed,
    ]);
    generate(composed, 'echo-composed', []);
    await rm(composed);

    const destination = join(output, variant);
    await rm(destination, { recursive: true, force: true });
    await rename(staging, destination);
    console.log(destination);
} finally {
    await rm(staging, { recursive: true, force: true });
}
