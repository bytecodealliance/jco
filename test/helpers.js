import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { argv, execArgv } from "node:process";
import { normalize, sep } from "node:path";
import { mkdtemp } from "node:fs/promises";

export const jcoPath = "src/jco.js";

export async function exec(cmd, ...args) {
  let stdout = "",
    stderr = "";
  await new Promise((resolve, reject) => {
    const processCmd = argv[0];
    const cmdArgs = ["--no-warnings", ...execArgv, cmd, ...args];
    const cp = spawn(processCmd, cmdArgs, {
      stdio: "pipe",
    });
    cp.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    cp.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    cp.on("error", reject);
    cp.on("exit", (code) => {
      if (code !== 0) {
        const output = (stderr || stdout).toString();
        reject(
          new Error(`error while executing [${cmd} ${cmdArgs}]:\n${output}`),
        );
        return;
      }
      resolve();
    });
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
