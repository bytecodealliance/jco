/**
 * This file contains a demo implementation that serves the built HTTP server WebAssembly component
 * in this project on localhost.
 *
 * To serve the component, we use `jco serve`, given that it is a dependency.
 */

import { fileURLToPath } from "node:url";
import { createServer as createNetServer } from "node:net";
import { env } from "node:process";
import { stat } from "node:fs/promises";
import { spawn } from "node:child_process";

import terminate from "terminate";

/** Where to find Jco as an executable */
const JCO_PATH = env.JCO_PATH ?? "jco";

/** Path to the WASM file to be used */
const WASM_PATH = fileURLToPath(
    new URL(env.WASM_PATH ?? "../dist/component.wasm", import.meta.url),
);

async function main() {
    // Determine paths to jco and output wasm
    const wasmPathExists = await stat(WASM_PATH)
          .then((p) => p.isFile())
          .catch(() => false);
    if (!wasmPathExists) {
        throw new Error(
            `Missing/invalid Wasm binary @ [${WASM_PATH}] (has 'npm run build' been run?)`,
        );
    }

    // Generate a random port
    const randomPort = await getRandomPort();

    // Spawn jco serve
    const proc = spawn(JCO_PATH, ["serve", "--port", randomPort, WASM_PATH], {
        detached: false,
        stdio: "pipe",
        shell: false,
    });

    // Wait for the server to start
    await new Promise((resolve) => {
        proc.stderr.on("data", (data) => {
            console.error(`[jco serve] [stderr] ${data.toString()}`);
            if (data.includes("Server listening")) {
                resolve();
            }
        });
    });

    // Execute the WASM module running via jco serve
    try {
        const resp = await fetch(`http://localhost:${randomPort}`);
        const respText = await resp.text();
        console.log(`fetch() OUTPUT:\n${respText}`);
    } catch (err) {
        throw err;
    } finally {
        terminate(proc.pid);
    }
}

// Utility function for getting a random port
export async function getRandomPort() {
    return await new Promise((resolve) => {
        const server = createNetServer();
        server.listen(0, function () {
            const port = this.address().port;
            server.on("close", () => resolve(port));
            server.close();
        });
    });
}

await main();
