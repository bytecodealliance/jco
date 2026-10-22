#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, copyFile, mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { compilerEnvironment, hostTools, pins, toolchainDirectory } from './perry-toolchain.mjs';

export function run(command, args, { capture = false, ...options } = {}) {
    console.log(`> ${command} ${args.map((arg) => JSON.stringify(arg)).join(' ')}`);
    return new Promise((resolveRun, reject) => {
        const child = spawn(command, args, { ...options, stdio: ['inherit', capture ? 'pipe' : 'inherit', 'inherit'] });
        let stdout = '';
        if (capture) {
            child.stdout.setEncoding('utf8');
            child.stdout.on('data', (chunk) => {
                stdout += chunk;
            });
        }
        child.once('error', (error) =>
            reject(
                new Error(`Cannot run ${command}: ${error.message}. See the example's prerequisites.`, {
                    cause: error,
                }),
            ),
        );
        child.once('close', (code, signal) => {
            if (code === 0) {
                resolveRun(stdout.trim());
            } else {
                reject(new Error(`${command} failed (${signal ?? code}); build files were retained for a retry.`));
            }
        });
    });
}

export async function verifyChecksum(file, expected) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) {
        hash.update(chunk);
    }
    assert.equal(hash.digest('hex'), expected, `SHA-256 mismatch: ${file}`);
}

export async function download(url, file, checksum, exec = run) {
    try {
        await verifyChecksum(file, checksum);
        return;
    } catch (error) {
        if (error.code !== 'ENOENT' && error.code !== 'ERR_ASSERTION') {
            throw error;
        }
    }
    await exec(process.platform === 'win32' ? 'curl.exe' : 'curl', [
        '--fail',
        '--location',
        '--retry',
        '3',
        '--connect-timeout',
        '30',
        '--proto',
        '=https',
        '--proto-redir',
        '=https',
        url,
        '-o',
        `${file}.part`,
    ]);
    await verifyChecksum(`${file}.part`, checksum);
    await rename(`${file}.part`, file);
}

async function exists(file) {
    try {
        await stat(file);
        return true;
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
        return false;
    }
}

async function unpack(archive, destination, parent, checksum, exec, executable) {
    const marker = join(destination, '.jco-archive-sha256');
    try {
        if ((await readFile(marker, 'utf8')) === checksum) {
            return;
        }
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }
    // A partial extraction may already contain clang or CMakeLists.txt. Only a completed
    // extraction gets a marker, so an interrupted install can be retried safely.
    await exec(executable('cmake'), ['-E', 'tar', 'xf', archive], { cwd: parent });
    await writeFile(marker, checksum);
}

export async function checkLlvm(prefix, exec = run, platform = process.platform, arch = process.arch) {
    const executable = hostTools(platform, arch).executable;
    const version = await exec(join(prefix, 'bin', executable('llvm-config')), ['--version'], { capture: true });
    assert.match(version, /^22\./, 'Perry requires LLVM 22 development libraries');
    assert.ok(
        await exists(join(prefix, 'include', 'llvm', 'Target', 'TargetMachine.h')),
        'LLVM development headers are missing',
    );
    if (platform === 'win32') {
        assert.ok(await exists(join(prefix, 'lib', 'LLVM-C.lib')), 'LLVM-C.lib is missing');
        assert.ok(await exists(join(prefix, 'bin', 'LLVM-C.dll')), 'LLVM-C.dll is missing');
    } else {
        const targets = await exec(join(prefix, 'bin', executable('llvm-config')), ['--targets-built'], {
            capture: true,
        });
        for (const target of ['X86', 'AArch64', 'WebAssembly']) {
            assert.ok(targets.split(/\s+/).includes(target), `LLVM is missing the ${target} backend`);
        }
        const config = join(prefix, 'bin', executable('llvm-config'));
        const libdir = await exec(config, ['--libdir'], { capture: true });
        const libraries = await exec(config, ['--link-static', '--libnames'], { capture: true });
        assert.ok(libraries, 'LLVM static library list is empty');
        for (const library of libraries.split(/\s+/)) {
            assert.ok(await exists(join(libdir, library)), `LLVM static library is missing: ${library}`);
        }
    }
    return version;
}

export async function buildLlvm(
    directory,
    jobs,
    exec = run,
    platform = process.platform,
    arch = process.arch,
    fetchArchive = download,
) {
    const { executable } = hostTools(platform, arch);
    const build = join(directory, 'build', `llvm-${pins.llvmVersion}`);
    const llvm = join(directory, `llvm-${pins.llvmVersion}`);
    const archive = join(directory, 'downloads', `llvm-project-${pins.llvmVersion}.src.tar.xz`);
    await fetchArchive(
        `https://github.com/llvm/llvm-project/releases/download/llvmorg-${pins.llvmVersion}/llvm-project-${pins.llvmVersion}.src.tar.xz`,
        archive,
        pins.llvmSha256,
        exec,
    );
    const source = join(directory, 'build', `llvm-project-${pins.llvmVersion}.src`);
    await unpack(archive, source, join(directory, 'build'), pins.llvmSha256, exec, executable);
    await exec(executable('cmake'), [
        '-S',
        join(source, 'llvm'),
        '-B',
        build,
        '-G',
        'Ninja',
        '-DCMAKE_BUILD_TYPE=Release',
        `-DCMAKE_INSTALL_PREFIX=${llvm}`,
        '-DLLVM_TARGETS_TO_BUILD=X86;AArch64;WebAssembly',
        '-DLLVM_BUILD_TOOLS=OFF',
        '-DLLVM_INCLUDE_TESTS=OFF',
        '-DLLVM_INCLUDE_BENCHMARKS=OFF',
        '-DLLVM_INCLUDE_EXAMPLES=OFF',
        '-DLLVM_INCLUDE_DOCS=OFF',
        '-DLLVM_ENABLE_ZLIB=OFF',
        '-DLLVM_ENABLE_ZSTD=OFF',
        '-DLLVM_ENABLE_LIBXML2=OFF',
        '-DLLVM_ENABLE_LIBEDIT=OFF',
        '-DLLVM_ENABLE_FFI=OFF',
        '-DLLVM_ENABLE_CURL=OFF',
        '-DLLVM_ENABLE_HTTPLIB=OFF',
        '-DLLVM_ENABLE_LIBPFM=OFF',
        ...(platform === 'win32'
            ? ['-DLLVM_BUILD_LLVM_C_DYLIB=ON', '-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreadedDLL']
            : []),
        ...(platform === 'darwin' ? [`-DCMAKE_OSX_ARCHITECTURES=${arch === 'arm64' ? 'arm64' : 'x86_64'}`] : []),
    ]);
    await exec(executable('cmake'), ['--build', build, '--parallel', String(jobs)]);
    // LLVM_BUILD_TOOLS=OFF avoids building every LLVM utility; llvm-sys still needs llvm-config.
    await exec(executable('cmake'), ['--build', build, '--target', 'llvm-config', '--parallel', String(jobs)]);
    await exec(executable('cmake'), ['--install', build]);
    await mkdir(join(llvm, 'bin'), { recursive: true });
    await copyFile(join(build, 'bin', executable('llvm-config')), join(llvm, 'bin', executable('llvm-config')));
    return llvm;
}

export async function install({
    jobs = Math.min(2, availableParallelism()),
    llvmPrefix,
    directory = toolchainDirectory,
    exec = run,
    fetchArchive = download,
    platform = process.platform,
    arch = process.arch,
} = {}) {
    const { executable, python, rustToolchain, sdkArchive, sdkChecksum } = hostTools(platform, arch);
    assert.match(pins.perryRef, /^[a-f0-9]{40}$/, 'Pin perryRef to a full Git commit SHA');
    assert.ok(Number.isInteger(jobs) && jobs > 0, '--jobs must be a positive integer');
    await mkdir(directory, { recursive: true });
    directory = await realpath(directory);
    for (const name of ['downloads', 'build', 'bin', 'runtime']) {
        await mkdir(join(directory, name), { recursive: true });
    }
    for (const command of ['git', 'cmake', 'ninja', 'rustup', 'curl']) {
        await exec(executable(command), ['--version']);
    }
    const pythonVersion = await exec(python, ['--version'], { capture: true });
    assert.match(pythonVersion, /^Python 3\.(?:1[0-9]|[2-9][0-9])\./, 'Python 3.10 or newer is required');
    if (platform === 'win32') {
        await exec('where.exe', ['cl.exe']);
    }
    await exec(executable('rustup'), [
        'toolchain',
        'install',
        rustToolchain,
        '--profile',
        'minimal',
        '--target',
        'wasm32-wasip2',
    ]);

    console.log(`Building Perry ${pins.perryRef} in ${directory}. No system packages are installed.`);
    const llvm = llvmPrefix
        ? await realpath(resolve(llvmPrefix))
        : await buildLlvm(directory, jobs, exec, platform, arch, fetchArchive);
    const llvmVersion = await checkLlvm(llvm, exec, platform, arch);
    const sdkDownload = join(directory, 'downloads', sdkArchive);
    await fetchArchive(
        `https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-${pins.wasiSdkVersion}/${sdkArchive}`,
        sdkDownload,
        sdkChecksum,
        exec,
    );
    const sdk = join(directory, sdkArchive.replace(/\.tar\.gz$/, ''));
    await unpack(sdkDownload, sdk, directory, sdkChecksum, exec, executable);
    assert.ok(await exists(join(sdk, 'share', 'wasi-sysroot')), 'wasi-sdk sysroot is missing');
    await exec(join(sdk, 'bin', executable('clang')), ['--version']);

    const installation = {
        perryRef: pins.perryRef,
        rustToolchain,
        llvmVersion,
        platform,
        arch,
        recipe: pins,
        compiler: join(directory, 'bin', executable('perry')),
        runtime: join(directory, 'runtime'),
        sdk,
        llvm,
    };
    const env = {
        ...compilerEnvironment(installation, process.env, platform),
        LLVM_SYS_221_PREFIX: llvm,
        RUSTUP_TOOLCHAIN: rustToolchain,
        CARGO_TARGET_DIR: join(directory, 'build', 'perry-target'),
        CARGO_BUILD_JOBS: String(jobs),
        CARGO_PROFILE_DEV_DEBUG: '0',
        CARGO_PROFILE_DEV_INCREMENTAL: 'false',
        CC_wasm32_wasip2: join(sdk, 'bin', executable('clang')),
        AR_wasm32_wasip2: join(sdk, 'bin', executable('llvm-ar')),
        CFLAGS_wasm32_wasip2: `--target=wasm32-wasip2 --sysroot="${join(sdk, 'share', 'wasi-sysroot').replaceAll('\\', '/').replaceAll('"', '\\"')}"`,
        CC_SHELL_ESCAPED_FLAGS: '1',
    };
    const source = join(directory, 'build', 'perry-source');
    if (!(await exists(join(source, '.git')))) {
        await exec(executable('git'), ['init', '-q', source]);
        await exec(executable('git'), ['remote', 'add', 'origin', 'https://github.com/PerryTS/perry.git'], {
            cwd: source,
        });
    }
    if (await exists(join(source, 'Cargo.toml'))) {
        await exec(executable('git'), ['diff', '--exit-code', 'HEAD'], { cwd: source });
    }
    await exec(executable('git'), ['fetch', '--depth', '1', 'origin', pins.perryRef], { cwd: source });
    await exec(executable('git'), ['-c', 'core.autocrlf=false', 'checkout', '--detach', 'FETCH_HEAD'], { cwd: source });
    const revision = await exec(executable('git'), ['rev-parse', 'HEAD'], { cwd: source, capture: true });
    assert.equal(revision, pins.perryRef, 'Unexpected Perry source revision');
    await exec(
        executable('cargo'),
        ['build', '--locked', '-p', 'perry', '--no-default-features', '--features', 'compile-cli,target-wasi'],
        { cwd: source, env },
    );
    await exec(python, ['scripts/wasi_build_runtime.py'], { cwd: source, env });
    // A failed replacement must not leave an earlier receipt claiming the new binaries passed.
    await rm(join(directory, 'install.json'), { force: true });
    await copyFile(join(env.CARGO_TARGET_DIR, 'debug', executable('perry')), installation.compiler);
    if (platform !== 'win32') {
        await chmod(installation.compiler, 0o755);
    }
    const runtime = join(installation.runtime, 'libperry_runtime.a');
    await copyFile(join(env.CARGO_TARGET_DIR, 'wasm32-wasip2', 'release', 'libperry_runtime.a'), runtime);
    assert.ok((await stat(runtime)).size > 0, 'Perry runtime archive is empty');
    await exec(installation.compiler, ['--version'], { env });
    const probe = join(directory, 'build', 'probe.ts');
    const component = join(directory, 'build', 'probe.wasm');
    await writeFile(probe, 'console.log("Perry WASI toolchain ready");\n');
    await exec(installation.compiler, ['compile', probe, '--target', 'wasi', '-o', component], { env });
    assert.deepEqual(
        [...(await readFile(component)).subarray(0, 8)],
        [0, 97, 115, 109, 13, 0, 1, 0],
        'Perry did not link a WASI component',
    );
    await writeFile(join(directory, 'install.json.tmp'), `${JSON.stringify(installation, null, 2)}\n`);
    await rename(join(directory, 'install.json.tmp'), join(directory, 'install.json'));
    console.log('Perry toolchain ready. Run pnpm run all from the example directory.');
    return installation;
}

export async function main(args = process.argv.slice(2)) {
    const { values } = parseArgs({
        args,
        options: { help: { type: 'boolean' }, jobs: { type: 'string' }, 'llvm-prefix': { type: 'string' } },
    });
    if (values.help) {
        console.log(
            'Usage: node scripts/install-perry.mjs [--jobs N] [--llvm-prefix PATH]\nBuilds pinned LLVM, Perry and its WASI runtime under .perry-toolchain without sudo.\nRequires Git, curl, CMake, Ninja, Python 3.10+, rustup and a native C/C++ toolchain.',
        );
        return;
    }
    await install({ ...(values.jobs ? { jobs: Number(values.jobs) } : {}), llvmPrefix: values['llvm-prefix'] });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
