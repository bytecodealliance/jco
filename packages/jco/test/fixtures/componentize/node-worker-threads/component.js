import workers, {
    Worker,
    isMainThread,
    setEnvironmentData,
    getEnvironmentData,
    markAsUncloneable,
    markAsUntransferable,
    isMarkedAsUntransferable,
} from "node:worker_threads";
import * as namespace from "node:worker_threads";
import { EventEmitter } from "node:events";

function check(value, message) {
    if (!value) {
        throw new Error(message);
    }
}
function code(fn) {
    try {
        fn();
    } catch (error) {
        return error.code;
    }
    throw new Error("expected failure");
}

export function contract() {
    check(workers === namespace.default && Worker === workers.Worker, "module identity");
    check(Object.keys(namespace).length === Object.keys(workers).length + 1, "named exports");
    check(
        isMainThread && !workers.isInternalThread && workers.threadId === 0 && workers.threadName === "",
        "main-thread state",
    );
    check(workers.parentPort === null && workers.workerData === null, "no parent");
    check(workers.SHARE_ENV === Symbol.for("nodejs.worker_threads.SHARE_ENV"), "symbol identity");
    const key = {};
    const value = { count: 2 };
    setEnvironmentData(key, value);
    check(getEnvironmentData(key) === value && getEnvironmentData({}) === undefined, "environment identity");
    setEnvironmentData(key);
    check(getEnvironmentData(key) === undefined, "environment deletion");
    markAsUntransferable(value);
    check(isMarkedAsUntransferable(value) && !isMarkedAsUntransferable({}), "transfer marking");
    markAsUncloneable(value);
    check(code(() => new Worker("1", { eval: true, workerData: value })) === 25, "clone marking");
    let touched = false;
    const poison = {
        get field() {
            touched = true;
            throw new Error("touched");
        },
    };
    for (const operation of [
        () => new workers.MessageChannel(),
        () => new workers.MessagePort(),
        () => new workers.BroadcastChannel(poison),
        () => workers.moveMessagePortToContext(poison, poison),
        () => workers.receiveMessageOnPort(poison),
        () => workers.postMessageToThread(1, poison),
        () => workers.locks.request("name", poison),
        () => workers.locks.query(),
        () => new Worker("1", { transferList: [poison] }),
        () => new Worker("1", { env: workers.SHARE_ENV }),
    ]) {
        check(code(operation) === "ERR_JCO_UNSUPPORTED_NODE_API", "unsupported operation");
    }
    check(!touched, "fail-fast arguments");
    return JSON.stringify({ module: true, environment: true, marking: true, unsupported: true });
}

export function denied() {
    return String(code(() => new Worker("1", { eval: true })));
}

let worker;
let state;
export function start(token) {
    state = { events: [], errors: [], message: null, exit: null, terminated: false };
    setEnvironmentData("token", token);
    worker = new Worker(
        `
        const { parentPort, workerData, getEnvironmentData, isMainThread } = require('node:worker_threads');
        parentPort.once('message', message => {
            parentPort.postMessage({
                token: getEnvironmentData('token'), data: workerData,
                main: isMainThread, cycle: message.self === message,
                bigint: message.bigint, map: message.map.get('key'),
                undefinedPresent: Object.hasOwn(message, 'missing') && message.missing === undefined
            });
            parentPort.close();
        });
    `,
        { eval: true, workerData: { token }, name: "component-worker" },
    );
    check(worker instanceof EventEmitter, "shared EventEmitter class");
    check(worker.ref() === worker && worker.unref() === worker, "reference control");
    worker.ref();
    for (const event of ["online", "message", "exit"]) {
        worker.on(event, () => state.events.push(event));
    }
    worker.on("message", (value) => {
        state.message = { ...value, bigint: String(value.bigint) };
    });
    worker.on("error", (error) => state.errors.push(error.message));
    worker.on("exit", (code) => {
        state.exit = code;
    });
    const message = { bigint: 123n, map: new Map([["key", 42]]), missing: undefined };
    message.self = message;
    worker.postMessage(message);
    setEnvironmentData("token", token + 1);
    return worker.threadId;
}
export function status() {
    return JSON.stringify({ ...state, threadId: worker?.threadId });
}
export function stop() {
    if (worker) {
        worker.terminate().then(() => {
            state.terminated = true;
        });
    }
}
