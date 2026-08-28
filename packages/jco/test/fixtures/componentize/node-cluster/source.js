// Ordinary Node source: it imports node:cluster the way an application would, exercises the
// supported surface, and deliberately touches the unsupported parts so their errors are observable
// from the host side rather than only in unit tests.
import cluster from "node:cluster";

/** Run `fn`, returning the thrown error's `code` or `"no-error"` when it unexpectedly succeeds. */
function codeOf(fn) {
    try {
        fn();
        return "no-error";
    } catch (error) {
        return error?.code ?? `unexpected: ${error}`;
    }
}

export function run() {
    let roleChecks = 0;
    if (typeof cluster.isPrimary === "boolean") {
        roleChecks += 1;
    }
    if (typeof cluster.isWorker === "boolean") {
        roleChecks += 1;
    }
    if (cluster.isPrimary !== cluster.isWorker) {
        roleChecks += 1;
    }

    let constantChecks = 0;
    if (cluster.SCHED_NONE === 1) {
        constantChecks += 1;
    }
    if (cluster.SCHED_RR === 2) {
        constantChecks += 1;
    }
    if (typeof cluster.Worker === "function") {
        constantChecks += 1;
    }

    let emitterChecks = 0;
    const seen = [];
    cluster.on("probe", (value) => seen.push(value));
    if (cluster.emit("probe", 1) === true) {
        emitterChecks += 1;
    }
    if (seen.length === 1) {
        emitterChecks += 1;
    }
    cluster.removeAllListeners("probe");
    if (cluster.listenerCount("probe") === 0) {
        emitterChecks += 1;
    }

    let settingsChecks = 0;
    const settings = cluster.settings;
    if (typeof settings === "object" && settings !== null) {
        settingsChecks += 1;
    }
    if (Array.isArray(settings.args)) {
        settingsChecks += 1;
    }
    if (typeof cluster.schedulingPolicy === "number") {
        settingsChecks += 1;
    }

    // Supported: forking, then reading the worker back out of cluster.workers.
    let forkChecks = 0;
    let workerProcessCode = "not-reached";
    const worker = cluster.fork({ ROLE: "guest-probe" });
    if (typeof worker.id === "number") {
        forkChecks += 1;
    }
    if (cluster.workers[worker.id] === worker) {
        forkChecks += 1;
    }
    if (typeof worker.isDead() === "boolean") {
        forkChecks += 1;
    }
    workerProcessCode = codeOf(() => worker.process);
    worker.disconnect();

    return {
        roleChecks,
        constantChecks,
        emitterChecks,
        settingsChecks,
        forkChecks,
        workerProcessCode,
        setupMasterCode: codeOf(() => cluster.setupMaster()),
        isMasterCode: codeOf(() => cluster.isMaster),
        hostSettingCode: codeOf(() => cluster.setupPrimary({ exec: "other.js" })),
        nonJsonMessageCode: codeOf(() => worker.send(() => undefined)),
        metaEventCode: codeOf(() => cluster.on("newListener", () => undefined)),
    };
}
