import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { test } from 'node:test';

import { checkLlvm, download, install, main, run, verifyChecksum } from './install-perry.mjs';
import { compilerEnvironment, hostTools, localCompiler, pins } from './perry-toolchain.mjs';

async function temporaryDirectory(t) {
    const directory = await realpath(await mkdtemp(join(tmpdir(), 'jco perry installer ')));
    t.after(() => rm(directory, { recursive: true, force: true }));
    return directory;
}

async function file(path, contents = 'fixture') {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents);
}

// Model native build tools' outputs without compiling LLVM in the script tests.
// The real runner, checksum verifier, selection, and filesystem operations have separate coverage.
function buildTools(directory, platform, arch, { brokenComponent = false } = {}) {
    const calls = [];
    const downloads = [];
    const { executable, sdkArchive } = hostTools(platform, arch);
    const llvm = join(directory, `llvm-${pins.llvmVersion}`);
    const exec = async (command, args, options = {}) => {
        calls.push({ command, args, ...options });
        assert.ok(!['sudo', 'apt', 'apt-get', 'brew', 'choco'].includes(basename(command).replace(/\.exe$/, '')));
        if (args[0] === '-E' && args[1] === 'tar') {
            if (basename(args[3]).startsWith('llvm-project')) {
                await file(join(options.cwd, `llvm-project-${pins.llvmVersion}.src`, 'llvm', 'CMakeLists.txt'));
            } else {
                const sdk = join(options.cwd, sdkArchive.replace(/\.tar\.gz$/, ''));
                await file(join(sdk, 'bin', executable('clang')));
                await file(join(sdk, 'bin', executable('llvm-ar')));
                await mkdir(join(sdk, 'share', 'wasi-sysroot'), { recursive: true });
            }
        } else if (args.includes('--target') && args.includes('llvm-config')) {
            await file(join(args[1], 'bin', executable('llvm-config')));
        } else if (args[0] === '--install') {
            await file(join(llvm, 'include', 'llvm', 'Target', 'TargetMachine.h'));
            await file(join(llvm, 'lib', 'libLLVMCore.a'));
            if (platform === 'win32') {
                await file(join(llvm, 'lib', 'LLVM-C.lib'));
                await file(join(llvm, 'bin', 'LLVM-C.dll'));
            }
        } else if (command.endsWith(executable('llvm-config'))) {
            if (args[0] === '--version') {
                return pins.llvmVersion;
            }
            if (args[0] === '--targets-built') {
                return 'X86 AArch64 WebAssembly';
            }
            if (args[0] === '--libdir') {
                return join(llvm, 'lib');
            }
            return 'libLLVMCore.a';
        } else if (command === hostTools(platform, arch).python && args[0] === '--version') {
            return 'Python 3.12.1';
        } else if (command === executable('git') && args.includes('checkout')) {
            await file(join(options.cwd, 'Cargo.toml'));
        } else if (command === executable('git') && args[0] === 'rev-parse') {
            return pins.perryRef;
        } else if (command === executable('cargo')) {
            assert.deepEqual(args.slice(-2), ['--features', 'compile-cli,target-wasi']);
            await file(join(options.env.CARGO_TARGET_DIR, 'debug', executable('perry')));
        } else if (args[0] === 'scripts/wasi_build_runtime.py') {
            await file(join(options.env.CARGO_TARGET_DIR, 'wasm32-wasip2', 'release', 'libperry_runtime.a'));
        } else if (command.endsWith(executable('perry')) && args[0] === 'compile') {
            assert.match(await readFile(args[1], 'utf8'), /console.log/);
            await file(args.at(-1), brokenComponent ? 'invalid' : Buffer.from([0, 97, 115, 109, 13, 0, 1, 0]));
        }
        return '';
    };
    const fetchArchive = async (url, path, checksum) => {
        downloads.push({ url, checksum });
        await file(path);
    };
    return { exec, fetchArchive, calls, downloads };
}

for (const platform of ['linux', 'darwin', 'win32']) {
    for (const arch of ['x64', 'arm64']) {
        test(`installs the pinned toolchain for ${platform}/${arch} in a path with spaces`, async (t) => {
            const directory = await temporaryDirectory(t);
            const tools = buildTools(directory, platform, arch);
            const installed = await install({ directory, platform, arch, jobs: 2, ...tools });
            const receipt = JSON.parse(await readFile(join(directory, 'install.json'), 'utf8'));
            assert.deepEqual(receipt, installed);
            assert.equal(installed.perryRef, pins.perryRef);
            assert.equal(tools.downloads[1].checksum, pins.wasiSdkSha256[`${platform}-${arch}`]);
            const fetch = tools.calls.find(({ args }) => args[0] === 'fetch');
            assert.equal(fetch.args.at(-1), pins.perryRef);
            const configure = tools.calls.find(({ args }) => args[0] === '-S');
            assert.ok(configure.args.includes('-DLLVM_TARGETS_TO_BUILD=X86;AArch64;WebAssembly'));
            assert.equal(configure.args.includes('-DLLVM_BUILD_LLVM_C_DYLIB=ON'), platform === 'win32');
            const runtime = tools.calls.find(({ args }) => args[0] === 'scripts/wasi_build_runtime.py');
            assert.equal(runtime.env.RUSTUP_TOOLCHAIN, hostTools(platform, arch).rustToolchain);
            assert.match(runtime.env.CFLAGS_wasm32_wasip2, /--sysroot=".*jco perry installer .*"$/);
            assert.equal(runtime.env.CC_SHELL_ESCAPED_FLAGS, '1');
            assert.equal(runtime.cwd, fetch.cwd, 'compiler and runtime use the same checkout');
        });
    }
}

test('does not publish a successful install when the full link probe fails', async (t) => {
    const directory = await temporaryDirectory(t);
    const tools = buildTools(directory, 'linux', 'x64', { brokenComponent: true });
    await assert.rejects(
        install({ directory, platform: 'linux', arch: 'x64', ...tools }),
        /did not link a WASI component/,
    );
    await assert.rejects(readFile(join(directory, 'install.json')), { code: 'ENOENT' });
});

test('an existing development LLVM skips the source build', async (t) => {
    const directory = await temporaryDirectory(t);
    const prefix = join(directory, 'external LLVM');
    await file(join(prefix, 'include', 'llvm', 'Target', 'TargetMachine.h'));
    await file(join(prefix, 'lib', 'libLLVMCore.a'));
    const tools = buildTools(directory, 'linux', 'x64');
    const exec = (command, args, options) => {
        if (args[0] === '--libdir') {
            return join(prefix, 'lib');
        }
        return tools.exec(command, args, options);
    };
    const installed = await install({ directory, platform: 'linux', arch: 'x64', llvmPrefix: prefix, ...tools, exec });
    assert.equal(installed.llvm, prefix);
    assert.equal(tools.downloads.length, 1);
    assert.match(tools.downloads[0].url, /wasi-sdk/);
    assert.ok(!tools.calls.some(({ args }) => args[0] === '-S'));
});

test('a Clang installation without development headers or static libraries is rejected', async (t) => {
    const prefix = await temporaryDirectory(t);
    const exec = async (_command, args) => {
        if (args[0] === '--version') {
            return pins.llvmVersion;
        }
        if (args[0] === '--targets-built') {
            return 'X86 AArch64 WebAssembly';
        }
        if (args[0] === '--libdir') {
            return join(prefix, 'lib');
        }
        return 'libLLVMCore.a';
    };
    await assert.rejects(checkLlvm(prefix, exec, 'linux', 'x64'), /development headers/);
    await file(join(prefix, 'include', 'llvm', 'Target', 'TargetMachine.h'));
    await assert.rejects(checkLlvm(prefix, exec, 'linux', 'x64'), /static library is missing/);
});

test('an interrupted extraction is retried even when an SDK executable already exists', async (t) => {
    const directory = await temporaryDirectory(t);
    const tools = buildTools(directory, 'linux', 'x64');
    const sdk = join(directory, hostTools('linux', 'x64').sdkArchive.replace(/\.tar\.gz$/, ''));
    await file(join(sdk, 'bin', 'clang'), 'partial extraction');
    await install({ directory, platform: 'linux', arch: 'x64', ...tools });
    assert.equal(tools.calls.filter(({ args }) => args[0] === '-E' && args[1] === 'tar').length, 2);
    tools.calls.length = 0;
    await install({ directory, platform: 'linux', arch: 'x64', ...tools });
    assert.equal(tools.calls.filter(({ args }) => args[0] === '-E' && args[1] === 'tar').length, 0);
});

test('cached downloads are verified and corrupt downloads are rejected before extraction', async (t) => {
    const directory = await temporaryDirectory(t);
    const archive = join(directory, 'download');
    const contents = 'verified bytes';
    const checksum = createHash('sha256').update(contents).digest('hex');
    await file(archive, contents);
    const unexpectedDownload = () => assert.fail('a verified cache entry was downloaded again');
    await download('https://example.invalid/archive', archive, checksum, unexpectedDownload);
    await file(archive, 'corrupt cache');
    await assert.rejects(
        download('https://example.invalid/archive', archive, checksum, async () => {
            await file(`${archive}.part`, 'corrupt transfer');
        }),
        /SHA-256 mismatch/,
    );
    await assert.rejects(verifyChecksum(archive, checksum), /SHA-256 mismatch/);
});

test('native commands preserve spaces without invoking a shell', async (t) => {
    const directory = await temporaryDirectory(t);
    const script = join(directory, 'print arguments.mjs');
    await file(script, 'console.log(JSON.stringify(process.argv.slice(2)));');
    const args = ['a path with spaces', 'literal $(echo unexpected)', 'a&b'];
    assert.deepEqual(JSON.parse(await run(process.execPath, [script, ...args], { capture: true })), args);
});

test('Windows PATH uses the LLVM DLL directory without conflicting Path variables', () => {
    const installation = { llvm: 'C:\\tools with spaces\\llvm', runtime: 'runtime', sdk: 'sdk' };
    const env = compilerEnvironment(installation, { Path: 'C:\\Windows', KEEP: 'yes' }, 'win32');
    assert.equal(env.Path, undefined);
    assert.equal(env.PATH, `${join(installation.llvm, 'bin')};C:\\Windows`);
    assert.equal(env.KEEP, 'yes');
});

test('local selection needs no exports, preserves explicit selectors, and rejects stale pins', async (t) => {
    const directory = await temporaryDirectory(t);
    await assert.rejects(localCompiler([], {}, directory), /incomplete.*install:perry/);
    const installed = {
        perryRef: pins.perryRef,
        recipe: pins,
        platform: process.platform,
        arch: process.arch,
        compiler: 'local-perry',
        runtime: 'local-runtime',
        sdk: 'local-sdk',
        llvm: 'local-llvm',
    };
    await file(join(directory, 'install.json'), JSON.stringify(installed));
    const selected = await localCompiler([], {}, directory);
    assert.deepEqual(selected.options, ['--backend-perry-cli-path', 'local-perry']);
    assert.equal(selected.env.PERRY_RUNTIME_DIR, 'local-runtime');
    assert.equal(selected.env.WASI_SDK_PATH, 'local-sdk');
    for (const options of [['--backend-perry-package', 'custom'], ['--backend-perry-cli-path=/custom/perry']]) {
        assert.deepEqual(await localCompiler(options, {}, directory), { options, env: {} });
    }
    const external = { JCO_PERRY_CLI_PATH: '/external/perry' };
    assert.deepEqual(await localCompiler([], external, directory), { options: [], env: external });
    await file(join(directory, 'install.json'), JSON.stringify({ ...installed, perryRef: 'outdated' }));
    await assert.rejects(localCompiler([], {}, directory), /install:perry/);
});

test('unsupported hosts and invalid jobs fail before invoking build tools', async () => {
    assert.throws(() => hostTools('freebsd', 'x64'), /No pinned Perry toolchain/);
    const exec = () => assert.fail('invalid jobs must not start a build');
    await assert.rejects(install({ jobs: 0, exec }), /positive integer/);
    await assert.rejects(main(['--jobs', 'NaN']), /positive integer/);
});
