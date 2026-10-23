import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import pins from "../../../../examples/components/perry-filesystem/scripts/perry-toolchain.json" with { type: "json" };

// This feature subset covers the filesystem fixture, not arbitrary Perry apps.
export const perryRuntimeRecipe = {
    perryRef: pins.perryRef,
    rustToolchain: pins.rustToolchain,
    target: "wasm32-wasip2",
    profile: "wasi-size",
    optLevel: "z",
    lto: "fat",
    defaultFeatures: false,
    features: ["perry-runtime/keepalive-anchors"],
};

export async function buildPerryRuntime(source, output) {
    assert.ok(source, "Pass --perry-source or set JCO_PERRY_SOURCE to the pinned Perry checkout");
    assert.ok(process.env.WASI_SDK_PATH, "Set WASI_SDK_PATH to the wasi-sdk installation");
    source = resolve(source);
    const sdk = resolve(process.env.WASI_SDK_PATH);
    const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: source, encoding: "utf8" }).trim();
    assert.equal(revision, pins.perryRef, "Perry source must match the benchmark's pinned toolchain");
    execFileSync("git", ["diff", "--exit-code", "HEAD", "--"], { cwd: source, stdio: "inherit" });

    const directory = join(output, "perry-runtime");
    await mkdir(directory, { recursive: true });
    const executable = (name) => (process.platform === "win32" ? `${name}.exe` : name);
    const env = {
        ...process.env,
        RUSTUP_TOOLCHAIN: perryRuntimeRecipe.rustToolchain,
        CARGO_TARGET_DIR: resolve(process.env.CARGO_TARGET_DIR || join(directory, "target")),
        CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS || "2",
        CC_wasm32_wasip2: join(sdk, "bin", executable("clang")),
        AR_wasm32_wasip2: join(sdk, "bin", executable("llvm-ar")),
        CFLAGS_wasm32_wasip2: `--target=wasm32-wasip2 --sysroot="${join(sdk, "share", "wasi-sysroot").replaceAll("\\", "/").replaceAll('"', '\\"')}"`,
        CC_SHELL_ESCAPED_FLAGS: "1",
        CARGO_PROFILE_WASI_SIZE_OPT_LEVEL: perryRuntimeRecipe.optLevel,
        CARGO_PROFILE_WASI_SIZE_LTO: perryRuntimeRecipe.lto,
    };
    const args = [
        "build",
        "--locked",
        "--profile",
        perryRuntimeRecipe.profile,
        "--config",
        'profile.wasi-size.inherits="release"',
        "--config",
        `profile.wasi-size.opt-level="${perryRuntimeRecipe.optLevel}"`,
        // Perry overrides this package to level 3 in the inherited release profile.
        "--config",
        `profile.wasi-size.package.perry-runtime.opt-level="${perryRuntimeRecipe.optLevel}"`,
        "--config",
        `profile.wasi-size.lto="${perryRuntimeRecipe.lto}"`,
        "-p",
        "perry-runtime-static",
        "--target",
        perryRuntimeRecipe.target,
        "--no-default-features",
        "--features",
        perryRuntimeRecipe.features.join(","),
        "--message-format=json-render-diagnostics",
    ];
    console.log("Building Perry's filesystem runtime with reduced features, opt-level=z and fat LTO...");
    const messages = execFileSync("cargo", args, {
        cwd: source,
        env,
        encoding: "utf8",
        stdio: ["inherit", "pipe", "inherit"],
        maxBuffer: 16 * 1024 * 1024,
    });
    // Observe Cargo's artifact, including cache hits, instead of assuming an old
    // archive at a conventional path was rebuilt with this recipe.
    const artifact = messages
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
        .find(
            (message) =>
                message.reason === "compiler-artifact" &&
                message.target.name === "perry_runtime" &&
                message.target.kind.includes("staticlib"),
        );
    const archive = artifact?.filenames.find((path) => path.endsWith("libperry_runtime.a"));
    assert.ok(archive, "Cargo did not report a Perry runtime static archive");
    const installed = join(directory, "libperry_runtime.a");
    await copyFile(archive, installed);
    const bytes = await readFile(installed);
    assert.ok(bytes.length, "Perry runtime archive is empty");
    return {
        env: { ...process.env, WASI_SDK_PATH: sdk, PERRY_RUNTIME_DIR: directory },
        metadata: {
            recipe: perryRuntimeRecipe,
            source,
            archive: installed,
            archiveSha256: createHash("sha256").update(bytes).digest("hex"),
            rustcVersion: execFileSync("rustc", ["--version"], { env, encoding: "utf8" }).trim(),
            wasiSdkPath: sdk,
            clangVersion: execFileSync(join(sdk, "bin", executable("clang")), ["--version"], {
                encoding: "utf8",
            }).trim(),
            cargoArgs: args,
        },
    };
}
