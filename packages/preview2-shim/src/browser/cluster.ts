/**
 * Browser side of `jco:node/cluster`.
 *
 * There is no process model in a browser, so every operation fails explicitly rather than
 * pretending to be a single-worker cluster. `isPrimary` answers truthfully -- a page is always
 * the primary and never a worker -- so role checks work without reaching an error.
 */

const UNSUPPORTED = "node:cluster requires a process model, which is not available in a browser";

function unsupported(): never {
    throw { tag: "unsupported", val: UNSUPPORTED };
}

export function isPrimary(): boolean {
    return true;
}

export function currentWorker(): undefined {
    return undefined;
}

export function fork(): never {
    unsupported();
}

export function listWorkers(): never[] {
    return [];
}

export function getWorker(): never {
    unsupported();
}

export function send(): never {
    unsupported();
}

export function disconnectWorker(): never {
    unsupported();
}

export function disconnectAll(): never {
    unsupported();
}

export function kill(): never {
    unsupported();
}

export function getSettings(): {
    silent: boolean;
    args: string[];
    cwd: string;
    schedulingPolicy: number;
} {
    return { silent: false, args: [], cwd: "/", schedulingPolicy: 2 };
}

export function setSettings(): never {
    unsupported();
}

export function drainEvents(): never[] {
    return [];
}
