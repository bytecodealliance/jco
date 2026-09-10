// @ts-check
import denied from "@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/process/host";

export function createProcessHost() {
    /** @type {number[]} */
    const exitRequests = [];
    /** @satisfies {import("@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/process").ProcessHost} */
    const host = {
        // Leave all operations denied except those explicitly supplied by the embedder.
        ...denied,
        exit(code) {
            const status = Number(code?.val ?? 0);
            exitRequests.push(status);
            // This example fails the current guest call. It does not terminate the host
            // or prevent guest code from catching the error; lifecycle policy is the embedder's.
            throw { name: "Error", code: "COMPONENT_EXIT", message: `Component requested exit ${status}` };
        },
    };
    return { host, exitRequests };
}
