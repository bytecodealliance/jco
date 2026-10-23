import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { cpus, release } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { buildPerryRuntime, perryRuntimeRecipe } from "./perry-runtime.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fixtures = fileURLToPath(new URL("./fixtures/filesystem/", import.meta.url));
const output = join(root, "test", "output", "bench", "componentize-backends");
const jco = join(root, "dist", "jco.js");
const requireJco = createRequire(jco);
const backends = ["perry", "starlingmonkey", "quickjs"];
const optimizationArgs = [
    "-Oz",
    "--low-memory-unused",
    "--enable-bulk-memory",
    "--enable-reference-types",
    "--strip-debug",
];
const { values } = parseArgs({
    options: {
        samples: { type: "string", default: "20" },
        warmup: { type: "string", default: "3" },
        "skip-build": { type: "boolean", default: false },
        "wasm-opt-bin": { type: "string" },
        "perry-cli-path": { type: "string" },
        "perry-source": { type: "string" },
    },
});
const samples = Number(values.samples);
const warmup = Number(values.warmup);
const compiler = values["perry-cli-path"] || process.env.JCO_PERRY_CLI_PATH;
const perryCliPath = compiler ? resolve(compiler) : null;
assert.ok(Number.isInteger(samples) && samples > 0, "--samples must be a positive integer");
assert.ok(Number.isInteger(warmup) && warmup >= 0, "--warmup must be a nonnegative integer");

function command(script, args = [], env = process.env) {
    execFileSync(process.execPath, [script, ...args], { cwd: root, env, stdio: "inherit" });
}

async function packageVersion(name) {
    const directories =
        name === "@bytecodealliance/jco"
            ? [join(dirname(jco), "..")]
            : (requireJco.resolve.paths(name) ?? []).map((directory) => join(directory, name));
    for (const directory of directories) {
        try {
            const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
            if (manifest.name === name) {
                return manifest.version;
            }
        } catch (error) {
            if (error.code !== "ENOENT") {
                throw error;
            }
        }
    }
    throw new Error(`Cannot find the version of ${name}`);
}

function median(numbers) {
    const sorted = [...numbers].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function componentSize(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 ** 2) {
        return `${(bytes / 1024).toFixed(2)} KiB`;
    }
    return `${(bytes / 1024 ** 2).toFixed(2)} MiB`;
}

await mkdir(output, { recursive: true });
const guest = await readFile(join(fixtures, "guest.ts"), "utf8");
const guestSha256 = createHash("sha256").update(guest).digest("hex");
if (!values["skip-build"]) {
    assert.ok(perryCliPath, "Pass --perry-cli-path or set JCO_PERRY_CLI_PATH to a WASI-enabled Perry compiler");
    // A failed rebuild must not leave a receipt for partially replaced artifacts.
    await rm(join(output, "build.json"), { force: true });
    const perryRuntime = await buildPerryRuntime(values["perry-source"] || process.env.JCO_PERRY_SOURCE, output);

    // Keep the fixture's read/stat/print statements inside run(): StarlingMonkey
    // preinitializes module-level code while building the component.
    const ts = requireJco("typescript-compiler-api");
    const source = ts.createSourceFile("component.ts", guest, ts.ScriptTarget.Latest, true);
    const imports = source.statements.filter(ts.isImportDeclaration);
    const statements = source.statements.filter((statement) => !ts.isImportDeclaration(statement));
    const entry = join(output, "command.ts");
    await writeFile(
        entry,
        `${imports.map((statement) => statement.getFullText(source)).join("\n")}
export const run = { run() {
${statements.map((statement) => statement.getFullText(source)).join("\n")}
} };
`,
    );

    for (const backend of backends) {
        const directory = join(output, backend);
        await rm(directory, { recursive: true, force: true });
        await mkdir(directory);
        const component = join(directory, "component.wasm");
        if (backend === "perry") {
            command(
                jco,
                [
                    "componentize",
                    join(fixtures, "guest.ts"),
                    "--backend",
                    "perry",
                    "--backend-perry-cli-path",
                    perryCliPath,
                    "-o",
                    component,
                ],
                perryRuntime.env,
            );
        } else {
            const wit = join(directory, "wit");
            await cp(join(root, "lib", "wit", "builtin", "0.2.12"), join(wit, "deps"), { recursive: true });
            await writeFile(
                join(wit, "package.wit"),
                "package benchmark:filesystem-comparison;\nworld command { export wasi:cli/run@0.2.12; }\n",
            );
            command(jco, [
                "componentize",
                entry,
                "--backend",
                backend,
                "--wit",
                wit,
                "--world-name",
                "benchmark:filesystem-comparison/command",
                "-o",
                component,
                ...(backend === "quickjs" ? ["--backend-qjs-disable-async"] : []),
            ]);
        }
        const optimized = join(directory, "component.opt.wasm");
        command(jco, [
            "opt",
            component,
            "-o",
            optimized,
            ...(values["wasm-opt-bin"] ? ["--wasm-opt-bin", values["wasm-opt-bin"]] : []),
            "--",
            ...optimizationArgs,
        ]);
        command(jco, [
            "transpile",
            optimized,
            "--name",
            "component",
            "--bindgen-enable-wasm-exnref",
            "--instantiation",
            "async",
            "-o",
            join(directory, "transpiled"),
        ]);
    }
    const jsLauncher = perryCliPath && /\.[cm]?js$/i.test(perryCliPath);
    const perryVersion = perryCliPath
        ? execFileSync(
              jsLauncher ? process.execPath : perryCliPath,
              [...(jsLauncher ? [perryCliPath] : []), "--version"],
              {
                  cwd: root,
                  encoding: "utf8",
              },
          ).trim()
        : null;
    await writeFile(
        join(output, "build.json"),
        `${JSON.stringify(
            {
                guestSha256,
                jco: await packageVersion("@bytecodealliance/jco"),
                componentizeJs: await packageVersion("@bytecodealliance/componentize-js"),
                componentizeQjs: await packageVersion("componentize-qjs"),
                optimizationArgs,
                wasmOptVersion: execFileSync(
                    process.execPath,
                    [values["wasm-opt-bin"] || requireJco.resolve("binaryen/bin/wasm-opt"), "--version"],
                    {
                        cwd: root,
                        encoding: "utf8",
                    },
                ).trim(),
                wasmOptLauncher: values["wasm-opt-bin"] ?? null,
                perryRef: perryRuntime.metadata.recipe.perryRef,
                perryCliPath,
                perryVersion,
                perryRuntime: perryRuntime.metadata,
            },
            null,
            2,
        )}\n`,
    );
}

const build = JSON.parse(await readFile(join(output, "build.json"), "utf8"));
assert.equal(build.guestSha256, guestSha256, "Guest changed; rerun without --skip-build");
assert.deepEqual(build.optimizationArgs, optimizationArgs, "Optimization changed; rerun without --skip-build");
assert.deepEqual(
    build.perryRuntime?.recipe,
    perryRuntimeRecipe,
    "Perry runtime recipe changed; rerun without --skip-build",
);
const input = await readFile(join(fixtures, "data", "input.txt"));
const expected = `Perry size: ${input.length}\nPerry read: ${input.toString("utf8")}\n`.replaceAll("\r\n", "\n");
const measurements = Object.fromEntries(backends.map((backend) => [backend, []]));
// Rotate backend order between rounds to reduce bias from changing machine load.
for (let round = -warmup; round < samples; round++) {
    const offset = (round + warmup) % backends.length;
    for (let index = 0; index < backends.length; index++) {
        const backend = backends[(index + offset) % backends.length];
        const module = join(output, backend, "transpiled", "component.js");
        const start = process.hrtime.bigint();
        const result = spawnSync(
            process.execPath,
            [fileURLToPath(new URL("./componentize-backends-runner.mjs", import.meta.url)), module],
            {
                cwd: root,
                encoding: "utf8",
                timeout: 60_000,
            },
        );
        const processMs = Number(process.hrtime.bigint() - start) / 1e6;
        if (result.error) {
            throw result.error;
        }
        assert.equal(result.status, 0, `${backend} failed: ${result.stderr}`);
        assert.equal(result.stdout.replaceAll("\r\n", "\n"), expected, `${backend} produced different output`);
        const timing = JSON.parse(result.stderr.trim());
        if (round >= 0) {
            measurements[backend].push({ ...timing, processMs });
        }
    }
}

const rows = await Promise.all(
    backends.map(async (backend) => ({
        backend,
        componentBytes: (await stat(join(output, backend, "component.wasm"))).size,
        optimizedComponentBytes: (await stat(join(output, backend, "component.opt.wasm"))).size,
        runMs: median(measurements[backend].map((sample) => sample.runMs)),
        loadAndRunMs: median(measurements[backend].map((sample) => sample.loadAndRunMs)),
        processMs: median(measurements[backend].map((sample) => sample.processMs)),
        samples: measurements[backend],
    })),
);
const report = {
    measuredAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    osRelease: release(),
    cpu: cpus()[0]?.model,
    samples,
    warmup,
    inputBytes: input.length,
    inputSha256: createHash("sha256").update(input).digest("hex"),
    build,
    results: rows,
};
await writeFile(join(output, "results.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(
    "\n| Backend | As-built size | Optimized size | Run (median ms) | Load + run (median ms) | Node process (median ms) |",
);
console.log("| --- | ---: | ---: | ---: | ---: | ---: |");
for (const row of rows) {
    console.log(
        `| ${row.backend} | ${componentSize(row.componentBytes)} | ${componentSize(row.optimizedComponentBytes)} | ${row.runMs.toFixed(2)} | ${row.loadAndRunMs.toFixed(2)} | ${row.processMs.toFixed(2)} |`,
    );
}
console.log(
    `\nOptimized components: ${samples} samples/backend after ${warmup} warmups; details: ${join(output, "results.json")}`,
);
