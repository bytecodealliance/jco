import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { argv, execArgv } from "node:process";
import { normalize, sep } from "node:path";
import { mkdtemp } from "node:fs/promises";

export const jcoPath = "src/jco.js";
const multiMemory =
  Number(process.versions.node.split(".")[0]) >= 21
    ? ["--experimental-wasm-multi-memory"]
    : [];

export async function exec(cmd, ...args) {
  let stdout = "",
    stderr = "";
  await new Promise((resolve, reject) => {
    const cp = spawn(argv[0], ["--no-warnings", ...execArgv, cmd, ...args], {
      stdio: "pipe",
    });
    cp.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    cp.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    cp.on("error", reject);
    cp.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error((stderr || stdout).toString()))
    );
  });
  return { stdout, stderr };
}

/**
 * Securely creates a temporary directory and returns its path.
 *
 * The new directory is created using `fsPromises.mkdtemp()`.
 */
export async function getTmpDir() {
  return await mkdtemp(normalize(tmpdir() + sep));
}
