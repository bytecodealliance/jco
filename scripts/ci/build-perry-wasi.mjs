#!/usr/bin/env node
// Temporary source build until Perry publishes its WASI compiler/runtime.
// CI hashes this recipe for the finished-toolchain cache; update pins here.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, copyFile, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const PERRY_REVISION = '3945beb23ebeca54846a30d89cb4971de59b0c6c';
const RUST_TOOLCHAIN = 'nightly-2026-10-08';
const WASI_SDK_VERSION = 34;
const WASI_SDK_SHA256 = 'b761e3a0721dbae9c09a0059e5fdb2bf917d1b4a8a7b430fb3b5aafb0984b2c4';

export function run(command, args, { captureStdout = false, ...options } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            ...options,
            stdio: ['inherit', captureStdout ? 'pipe' : 'inherit', 'inherit'],
        });
        let stdout = '';
        if (captureStdout) {
            child.stdout.setEncoding('utf8');
            child.stdout.on('data', (chunk) => {
                stdout += chunk;
            });
        }
        child.once('error', reject);
        child.once('close', (code, signal) => {
            if (code === 0) {
                resolve(stdout);
            } else {
                reject(new Error(`${command} failed (${signal ?? code})`));
            }
        });
    });
}

export async function download(url, destination) {
    await run('curl', ['--fail', '--location', '--retry', '3', url, '-o', destination]);
}

export async function verifyChecksum(path, expected) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) {
        hash.update(chunk);
    }
    assert.equal(hash.digest('hex'), expected, `SHA-256 checksum mismatch: ${path}`);
}

export async function prepareLlvm(scratch, env) {
    // A local caller can reuse an existing installation with LLVM_SYS_221_PREFIX.
    let prefix = env.LLVM_SYS_221_PREFIX;
    if (!prefix) {
        const key = join(scratch, 'llvm.asc');
        await download('https://apt.llvm.org/llvm-snapshot.gpg.key', key);
        const keys = await run('gpg', ['--show-keys', '--with-colons', key], { env, captureStdout: true });
        const fingerprint = keys
            .split('\n')
            .find((line) => line.startsWith('fpr:'))
            ?.split(':')[9];
        assert.equal(fingerprint, '6084F3CF814B57C1CF12EFD515CF4D18AF4F7421', 'Unexpected LLVM signing key');
        await run('sudo', ['install', '-m', '644', key, '/usr/share/keyrings/jco-llvm.asc'], { env });

        // Match the pinned ubuntu-24.04 CI runner, rather than a moving latest image.
        const sources = join(scratch, 'jco-llvm22.list');
        await writeFile(
            sources,
            'deb [signed-by=/usr/share/keyrings/jco-llvm.asc] https://apt.llvm.org/noble/ llvm-toolchain-noble-22 main\n',
        );
        await run('sudo', ['install', '-m', '644', sources, '/etc/apt/sources.list.d/jco-llvm22.list'], { env });
        await run('sudo', ['apt-get', 'update', '-o', 'Acquire::Retries=3'], { env });
        await run(
            'sudo',
            [
                'apt-get',
                'install',
                '-y',
                '--no-install-recommends',
                'build-essential',
                'pkg-config',
                'python3',
                'llvm-22-dev',
                'libpolly-22-dev',
                'clang-22',
                'libffi-dev',
                'libxml2-dev',
                'libzstd-dev',
                'zlib1g-dev',
                'libssl-dev',
            ],
            { env },
        );
        prefix = '/usr/lib/llvm-22';
    }
    const version = (await run(join(prefix, 'bin', 'llvm-config'), ['--version'], { env, captureStdout: true })).trim();
    assert.match(version, /^22\./, 'LLVM 22 is required');
    return { prefix, version };
}

export async function installWasiSdk(destination, scratch) {
    const archive = join(scratch, 'sdk.tar.gz');
    await download(
        `https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-${WASI_SDK_VERSION}/wasi-sdk-${WASI_SDK_VERSION}.0-x86_64-linux.tar.gz`,
        archive,
    );
    await verifyChecksum(archive, WASI_SDK_SHA256);
    const sdk = join(destination, 'wasi-sdk');
    await mkdir(sdk, { recursive: true });
    await run('tar', ['-xzf', archive, '--strip-components=1', '-C', sdk]);
    return sdk;
}

export async function checkoutPerry(scratch, env) {
    const source = join(scratch, 'source');
    await run('git', ['init', '-q', source], { env });
    await run('git', ['remote', 'add', 'origin', 'https://github.com/PerryTS/perry.git'], { cwd: source, env });
    await run('git', ['fetch', '--depth', '1', 'origin', PERRY_REVISION], { cwd: source, env });
    await run('git', ['checkout', '--detach', 'FETCH_HEAD'], { cwd: source, env });
    const revision = (await run('git', ['rev-parse', 'HEAD'], { cwd: source, env, captureStdout: true })).trim();
    assert.equal(revision, PERRY_REVISION, 'Unexpected Perry source revision');
    return source;
}

export async function buildPerry(source, env) {
    await run(
        'cargo',
        ['build', '--locked', '-p', 'perry', '--no-default-features', '--features', 'compile-cli,target-wasi'],
        { cwd: source, env },
    );
    await run('python3', ['scripts/wasi_build_runtime.py'], { cwd: source, env });
}

export async function installPerry(destination, target) {
    await mkdir(join(destination, 'bin'), { recursive: true });
    await mkdir(join(destination, 'runtime'), { recursive: true });
    const compiler = join(destination, 'bin', 'perry');
    await copyFile(join(target, 'debug', 'perry'), compiler);
    await chmod(compiler, 0o755);
    const runtime = join(destination, 'runtime', 'libperry_runtime.a');
    await copyFile(join(target, 'wasm32-wasip2', 'release', 'libperry_runtime.a'), runtime);
    assert.ok((await stat(runtime)).size > 0, 'Perry WASI runtime archive is empty');
    return compiler;
}

export async function verifyWasiCompiler(compiler, scratch, env) {
    const source = join(scratch, 'probe.ts');
    const object = join(scratch, 'probe.o');
    await writeFile(source, 'export {};\n');
    await run(compiler, ['compile', source, '--target', 'wasi', '--no-link', '-o', object], { env });
    assert.deepEqual(
        [...(await readFile(object)).subarray(0, 8)],
        [0, 97, 115, 109, 1, 0, 0, 0],
        'Perry did not produce a Wasm object',
    );
}

export async function main() {
    if (process.platform !== 'linux' || process.arch !== 'x64') {
        throw new Error('The pinned Perry CI toolchain supports Linux x86_64 only.');
    }
    const output = process.argv[2];
    if (!output) {
        throw new Error('Usage: node scripts/ci/build-perry-wasi.mjs OUTPUT_DIRECTORY');
    }
    await mkdir(output, { recursive: true });
    const destination = await realpath(output);
    const scratch = await mkdtemp(join(tmpdir(), 'jco-perry-wasi-'));
    try {
        const llvm = await prepareLlvm(scratch, process.env);
        const sdk = await installWasiSdk(destination, scratch);
        const env = {
            ...process.env,
            LLVM_SYS_221_PREFIX: llvm.prefix,
            PATH: `${join(llvm.prefix, 'bin')}${delimiter}${process.env.PATH ?? ''}`,
            WASI_SDK_PATH: sdk,
            CC_wasm32_wasip2: join(sdk, 'bin', 'clang'),
            AR_wasm32_wasip2: join(sdk, 'bin', 'llvm-ar'),
            CFLAGS_wasm32_wasip2: `--target=wasm32-wasip2 --sysroot=${join(sdk, 'share', 'wasi-sysroot')}`,
            RUSTUP_TOOLCHAIN: RUST_TOOLCHAIN,
            CARGO_BUILD_JOBS: '2',
            CARGO_PROFILE_DEV_DEBUG: '0',
            CARGO_PROFILE_DEV_INCREMENTAL: 'false',
            CARGO_TARGET_DIR: join(scratch, 'target'),
        };
        await run(
            'rustup',
            ['toolchain', 'install', RUST_TOOLCHAIN, '--profile', 'minimal', '--target', 'wasm32-wasip2'],
            {
                env,
            },
        );
        const source = await checkoutPerry(scratch, env);
        await buildPerry(source, env);
        const compiler = await installPerry(destination, env.CARGO_TARGET_DIR);
        await verifyWasiCompiler(compiler, scratch, env);
        await writeFile(
            join(destination, 'build-info.txt'),
            `Perry: ${PERRY_REVISION}\nRust: ${RUST_TOOLCHAIN}\nLLVM: ${llvm.version}\nWASI SDK: ${WASI_SDK_VERSION}\n`,
        );
    } finally {
        await rm(scratch, { recursive: true, force: true });
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
