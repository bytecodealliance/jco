import { execFileSync, execSync, spawnSync } from "node:child_process";

export function run() {
    const spawned = spawnSync("node", ["-e", "process.stdin.pipe(process.stdout)"], {
        encoding: "utf8",
        input: "spawn input",
    });
    return {
        execFile: execFileSync("node", ["-e", 'process.stdout.write("exec file")'], { encoding: "utf8" }),
        spawn: spawned.stdout,
        status: spawned.status,
        shell: execSync("node --version", { encoding: "utf8" }).trim(),
    };
}
