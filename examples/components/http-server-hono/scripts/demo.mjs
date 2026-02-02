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
import assert from "node:assert";

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

    const jcoArgs = [
        "serve",
        "--port",
        randomPort,
        WASM_PATH,
    ];
    // Spawn jco serve
    const proc = spawn(JCO_PATH, jcoArgs, {
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

    const baseURL = `http://localhost:${randomPort}`;
    // Execute the WASM module running via jco serve
    try {
        await requestAndPrintOutput({ method: "GET", url: baseURL });

        // NOTE: the logic below currently is tied tightly to component functionality
        // for obvious reasons -- the componetn currently returns the method along with 
        // the post body,w hich it assumes to be JSON.

        let postBody = { data: 'example post body' };
        const postRespText = await requestAndPrintOutput({ 
            method: "POST", 
            url: `${baseURL}/json/post`, 
            body: JSON.stringify(postBody),
        });
        assert.deepEqual({ method: 'POST', body: postBody }, JSON.parse(postRespText));

        let deleteBody = { data: 'example delete body' };
        const deleteRespText = await requestAndPrintOutput({ 
            method: "DELETE", 
            url: `${baseURL}/json/delete`, 
            body: JSON.stringify(deleteBody),
        });
        assert.deepEqual({ method: 'DELETE', body: deleteBody }, JSON.parse(deleteRespText));

        let patchBody = { data: 'example patch body' };
        const patchRespText = await requestAndPrintOutput({ 
            method: "PATCH", 
            url: `${baseURL}/json/patch`, 
            body: JSON.stringify(patchBody),
        });
        assert.deepEqual({ method: 'PATCH', body: patchBody }, JSON.parse(patchRespText));

    } catch (err) {
        throw err;
    } finally {
        terminate(proc.pid);
    }
}

// Helper to perform simple requests and print output
async function requestAndPrintOutput({ url, method, body }) {
    try {
        const resp = await fetch(url, { method, body });
        const respText = await resp.text();
        console.log(`fetch(${method}, ${url}) OUTPUT:\n${respText}`);
        return respText;
    } catch (err) {
        console.error(`${method} request to [${url}] failed`, err);
        throw err;
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
