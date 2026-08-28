import type { Serializable } from "node:child_process";
import nodeCluster from "node:cluster";
import process from "node:process";

/**
 * Host side of `jco:node/cluster`.
 *
 * Backed by the runtime's real `node:cluster`. A transpiled component *is* a Node process, so
 * `cluster.fork()` re-executes the entry, re-instantiates the component, and the child observes
 * itself as a worker -- workers genuinely run guest code rather than a simulation of it.
 *
 * Cluster pushes events and the guest can only pull, so events are queued here and handed over by
 * `drainEvents`.
 */

type WorkerState = "none" | "online" | "listening" | "disconnected" | "dead";

interface WorkerInfo {
    id: number;
    state: WorkerState;
    exitedAfterDisconnect: boolean;
    connected: boolean;
    dead: boolean;
}

interface Settings {
    silent: boolean;
    args: string[];
    cwd: string;
    schedulingPolicy: number;
}

type Event =
    | { tag: "fork"; val: number }
    | { tag: "online"; val: number }
    | { tag: "disconnect"; val: number }
    | { tag: "exit"; val: { id: number; code: number; signal: string } }
    | { tag: "message"; val: { id: number; json: string } }
    | { tag: "setup" };

const events: Event[] = [];
let listening = false;

function failed(cause: unknown): never {
    throw { tag: "failed", val: cause instanceof Error ? cause.message : String(cause) };
}

function noSuchWorker(id: number): never {
    throw { tag: "no-such-worker", val: id };
}

function describe(worker: import("node:cluster").Worker): WorkerInfo {
    // Node exposes the phase as an internal string; normalize to the WIT enum.
    const state = (worker as unknown as { state?: string }).state ?? "none";
    const known: WorkerState[] = ["none", "online", "listening", "disconnected", "dead"];
    return {
        id: worker.id,
        state: known.includes(state as WorkerState) ? (state as WorkerState) : "none",
        exitedAfterDisconnect: worker.exitedAfterDisconnect === true,
        connected: worker.isConnected(),
        dead: worker.isDead(),
    };
}

/**
 * Subscribe to the runtime's cluster events once, on first use.
 *
 * Deferred so that importing this shim -- which every transpiled component does -- does not
 * attach listeners to a process that never uses cluster.
 */
function ensureListening(): void {
    if (listening) {
        return;
    }
    listening = true;

    if (nodeCluster.isPrimary) {
        nodeCluster.on("fork", (worker) => events.push({ tag: "fork", val: worker.id }));
        nodeCluster.on("online", (worker) => events.push({ tag: "online", val: worker.id }));
        nodeCluster.on("disconnect", (worker) =>
            events.push({ tag: "disconnect", val: worker.id }),
        );
        nodeCluster.on("exit", (worker, code, signal) =>
            events.push({
                tag: "exit",
                val: { id: worker.id, code: code ?? 0, signal: signal ?? "" },
            }),
        );
        nodeCluster.on("message", (worker, message) =>
            events.push({
                tag: "message",
                val: { id: worker.id, json: JSON.stringify(message) ?? "" },
            }),
        );
        nodeCluster.on("setup", () => events.push({ tag: "setup" }));
        return;
    }

    // In a worker, messages arrive from the primary on the process itself.
    process.on("message", (message) => {
        events.push({
            tag: "message",
            val: { id: nodeCluster.worker?.id ?? 0, json: JSON.stringify(message) ?? "" },
        });
    });
}

function requireWorker(id: number): import("node:cluster").Worker {
    ensureListening();
    const worker = nodeCluster.workers?.[id];
    if (!worker) {
        noSuchWorker(id);
    }
    return worker;
}

export function isPrimary(): boolean {
    return nodeCluster.isPrimary;
}

export function currentWorker(): WorkerInfo | undefined {
    ensureListening();
    const worker = nodeCluster.worker;
    return worker ? describe(worker) : undefined;
}

export function fork(env: [string, string][]): WorkerInfo {
    ensureListening();
    if (!nodeCluster.isPrimary) {
        throw { tag: "unsupported", val: "cluster.fork() may only be called from the primary" };
    }
    try {
        return describe(nodeCluster.fork(Object.fromEntries(env)));
    } catch (error) {
        failed(error);
    }
}

export function listWorkers(): WorkerInfo[] {
    ensureListening();
    return Object.values(nodeCluster.workers ?? {})
        .filter((worker) => worker !== undefined)
        .map((worker) => describe(worker));
}

export function getWorker(id: number): WorkerInfo {
    return describe(requireWorker(id));
}

export function send(id: number, json: string): void {
    ensureListening();
    // Anything that survived JSON.parse is by construction structured-cloneable, which is what
    // Node's IPC accepts; the parse result is simply untyped.
    const message = (json === "" ? undefined : JSON.parse(json)) as Serializable;
    // From a worker, `id` is ignored: the only peer is the primary.
    if (!nodeCluster.isPrimary) {
        if (!process.send) {
            throw { tag: "unsupported", val: "this worker has no IPC channel to the primary" };
        }
        process.send(message);
        return;
    }
    requireWorker(id).send(message);
}

export function disconnectWorker(id: number): void {
    requireWorker(id).disconnect();
}

export function disconnectAll(): void {
    ensureListening();
    nodeCluster.disconnect();
}

export function kill(id: number, signal: string): void {
    requireWorker(id).kill(signal === "" ? "SIGTERM" : signal);
}

export function getSettings(): Settings {
    const settings = nodeCluster.settings ?? {};
    return {
        silent: settings.silent === true,
        args: settings.args ? [...settings.args] : [],
        cwd: settings.cwd ?? process.cwd(),
        schedulingPolicy: nodeCluster.schedulingPolicy ?? nodeCluster.SCHED_RR,
    };
}

export function setSettings(value: Settings): void {
    ensureListening();
    if (!nodeCluster.isPrimary) {
        throw { tag: "unsupported", val: "cluster settings may only be changed from the primary" };
    }
    nodeCluster.schedulingPolicy = value.schedulingPolicy;
    try {
        nodeCluster.setupPrimary({ silent: value.silent, args: [...value.args], cwd: value.cwd });
    } catch (error) {
        failed(error);
    }
}

export function drainEvents(): Event[] {
    ensureListening();
    return events.splice(0, events.length);
}
