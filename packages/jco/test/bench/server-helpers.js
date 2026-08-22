import { createServer } from "node:net";
import { platform } from "node:process";

/** Reserve an unused local TCP port and release it for a test server. */
export async function getRandomPort() {
    return await new Promise((resolve) => {
        const server = createServer();
        server.listen(0, function () {
            const port = this.address().port;
            server.on("close", () => resolve(port));
            server.close();
        });
    });
}

/** Wait until a spawned server announces that it is ready on stderr. */
export async function waitForServer(child, readyMessage = "Server listening") {
    let stderr = "";
    await new Promise((resolve, reject) => {
        child.stderr.on("data", (chunk) => {
            stderr += chunk;
            if (stderr.includes(readyMessage)) {
                resolve();
            }
        });
        child.once("error", reject);
        child.once("exit", (code) => reject(new Error(`server exited with ${code}: ${stderr}`)));
    });
}

/** Terminate a detached server process and its descendants. */
export async function terminateServer(child) {
    const exited =
        child.exitCode === null && child.signalCode === null
            ? new Promise((resolve) => child.once("exit", resolve))
            : Promise.resolve();
    try {
        if (platform === "win32") {
            child.kill();
        } else {
            process.kill(-child.pid, "SIGTERM");
        }
    } catch (error) {
        if (error.code !== "ESRCH") {
            throw error;
        }
    }
    await exited;
}
