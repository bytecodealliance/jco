import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import { expect, test } from "vitest";

const execFileAsync = promisify(execFile);
const fixtureDir = fileURLToPath(new URL("./fixtures/rolldown-project/", import.meta.url));
const pluginDir = fileURLToPath(new URL("../", import.meta.url));

test("a pinned consumer project builds and runs through the Rolldown library", async () => {
    const tempRoot = resolve(pluginDir, ".tmp");
    await mkdir(tempRoot, { recursive: true });
    const tempDir = await mkdtemp(resolve(tempRoot, "consumer-"));
    try {
        const projectDir = resolve(tempDir, "project");
        const packDir = resolve(tempDir, "pack");
        await mkdir(packDir);
        await cp(fixtureDir, projectDir, { recursive: true });

        await execFileAsync("pnpm", ["--config.ignore-scripts=true", "pack", "--pack-destination", packDir], {
            cwd: pluginDir,
        });
        const tarballs = (await readdir(packDir)).filter((file) => file.endsWith(".tgz"));
        expect(tarballs).toHaveLength(1);

        const packagePath = resolve(projectDir, "package.json");
        const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
        packageJson.dependencies["@bytecodealliance/rolldown-plugin-jco"] = `file:${resolve(packDir, tarballs[0]!)}`;
        await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

        const install = await execFileAsync("pnpm", ["install", "--ignore-workspace"], {
            cwd: projectDir,
        });
        expect(install.stderr).toBe("");

        await import(`${pathToFileURL(resolve(projectDir, "build.mjs")).href}?test=${Date.now()}`);
        await import(`${pathToFileURL(resolve(projectDir, "verify.mjs")).href}?test=${Date.now()}`);
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});
