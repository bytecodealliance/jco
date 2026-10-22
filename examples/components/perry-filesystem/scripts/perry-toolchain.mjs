import { readFile, stat } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const toolchainDirectory = fileURLToPath(new URL('../.perry-toolchain/', import.meta.url));
export const pins = JSON.parse(await readFile(new URL('./perry-toolchain.json', import.meta.url), 'utf8'));

export function hostTools(platform = process.platform, arch = process.arch) {
    const checksum = pins.wasiSdkSha256[`${platform}-${arch}`];
    if (!checksum) {
        throw new Error(
            `No pinned Perry toolchain for ${platform}/${arch}. Supported hosts: ${Object.keys(pins.wasiSdkSha256).join(', ')}`,
        );
    }
    const os = { linux: 'linux', darwin: 'macos', win32: 'windows' }[platform];
    const cpu = { x64: 'x86_64', arm64: 'arm64' }[arch];
    const rustCpu = arch === 'arm64' ? 'aarch64' : 'x86_64';
    const rustOs = { linux: 'unknown-linux-gnu', darwin: 'apple-darwin', win32: 'pc-windows-msvc' }[platform];
    return {
        sdkArchive: `wasi-sdk-${pins.wasiSdkVersion}.0-${cpu}-${os}.tar.gz`,
        sdkChecksum: checksum,
        executable: (name) => (platform === 'win32' ? `${name}.exe` : name),
        python: platform === 'win32' ? 'python.exe' : 'python3',
        rustToolchain: `${pins.rustToolchain}-${rustCpu}-${rustOs}`,
    };
}

export function compilerEnvironment(installation, env = process.env, platform = process.platform) {
    // Node preserves the spelling of the Windows Path variable. Avoid passing both Path and PATH.
    const inherited = { ...env };
    const pathKey =
        platform === 'win32' ? (Object.keys(inherited).find((key) => key.toLowerCase() === 'path') ?? 'PATH') : 'PATH';
    const previousPath = inherited[pathKey] ?? '';
    delete inherited[pathKey];
    return {
        ...inherited,
        PATH: [join(installation.llvm, 'bin'), previousPath].join(platform === 'win32' ? ';' : delimiter),
        PERRY_RUNTIME_DIR: installation.runtime,
        WASI_SDK_PATH: installation.sdk,
    };
}

export async function localCompiler(options, env = process.env, directory = toolchainDirectory) {
    if (env.JCO_PERRY_CLI_PATH || options.some((arg) => /^--backend-perry-(cli-path|package)(=|$)/.test(arg))) {
        return { options, env };
    }
    let installed;
    try {
        installed = JSON.parse(await readFile(join(directory, 'install.json'), 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT') {
            try {
                await stat(directory);
            } catch (directoryError) {
                if (directoryError.code === 'ENOENT') {
                    return { options, env };
                }
                throw directoryError;
            }
            throw new Error('The local Perry toolchain is incomplete. Run pnpm run install:perry.');
        }
        throw error;
    }
    if (
        installed.perryRef !== pins.perryRef ||
        installed.platform !== process.platform ||
        installed.arch !== process.arch ||
        JSON.stringify(installed.recipe) !== JSON.stringify(pins)
    ) {
        throw new Error('The local Perry toolchain does not match this example or host. Run pnpm run install:perry.');
    }
    const compilerEnv = compilerEnvironment(installed, env);
    // Explicit runtime/SDK overrides remain available for an externally configured toolchain.
    compilerEnv.PERRY_RUNTIME_DIR = env.PERRY_RUNTIME_DIR || installed.runtime;
    compilerEnv.WASI_SDK_PATH = env.WASI_SDK_PATH || installed.sdk;
    return { options: [...options, '--backend-perry-cli-path', installed.compiler], env: compilerEnv };
}
