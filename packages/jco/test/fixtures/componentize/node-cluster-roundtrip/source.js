// Ordinary Node source exercising a real primary/worker round trip through node:cluster.
//
// cluster.fork() re-executes the host entry, so the forked process runs this same component again
// and observes itself as a worker. The Node-side runner drives the primary and the worker branch
// reports in over IPC.
import cluster from "node:cluster";

const events = [];
const messages = [];
let exited = false;

cluster.on("fork", () => events.push("fork"));
cluster.on("online", () => events.push("online"));
cluster.on("disconnect", () => events.push("disconnect"));
cluster.on("exit", () => {
    events.push("exit");
    exited = true;
});
cluster.on("message", (_worker, message) => {
    events.push("message");
    messages.push(JSON.stringify(message));
});

export function isPrimary() {
    return cluster.isPrimary;
}

export function start() {
    return cluster.fork({ ROLE: "roundtrip" }).id;
}

export function poll() {
    // Draining is what surfaces queued host events; see the docs on delivery timing.
    cluster.pump();
    return {
        events: events.join(","),
        messages: messages.join("|"),
        workerCount: Object.keys(cluster.workers).length,
        exited,
    };
}

export function reportIn() {
    const worker = cluster.worker;
    worker.send({ from: "worker", id: worker.id, role: "roundtrip" });
}

export function shutdown() {
    cluster.disconnect();
}
