import timers, {
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    setImmediate,
    clearImmediate,
    promises,
} from "node:timers";
import promiseTimers, { scheduler } from "node:timers/promises";
import * as namespace from "node:timers";

function check(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}
function code(fn) {
    try {
        fn();
    } catch (error) {
        return error.code;
    }
    throw new Error("expected synchronous error");
}
async function rejection(pending, expected, cause) {
    try {
        await pending;
    } catch (error) {
        check(error.code === expected, `unexpected rejection: ${error}`);
        if (expected === "ABORT_ERR") {
            check(error.name === "AbortError" && error.message === "The operation was aborted", "abort shape");
            check(error.cause === cause, "abort cause");
        }
        return;
    }
    throw new Error("expected rejection");
}

async function runAsync() {
    check(timers === namespace.default && timers.setTimeout === setTimeout, "module identity");
    check(timers.promises === promises && promises === promiseTimers, "subpath identity");
    check(setTimeout[Symbol.for("nodejs.util.promisify.custom")] === promises.setTimeout, "promisify timeout");
    check(setImmediate[Symbol.for("nodejs.util.promisify.custom")] === promises.setImmediate, "promisify immediate");
    check(Object.keys(timers).length === 7 && Object.keys(promises).length === 4, "export keys");
    for (const fn of [setTimeout, setInterval, setImmediate]) {
        for (const value of [null, 1, "function", {}, false]) {
            check(code(() => fn(value)) === "ERR_INVALID_ARG_TYPE", "callback validation");
        }
    }
    for (const options of [null, [], { signal: null }, { ref: 1 }]) {
        await rejection(promises.setTimeout(1, undefined, options), "ERR_INVALID_ARG_TYPE");
        await rejection(promises.setImmediate(undefined, options), "ERR_INVALID_ARG_TYPE");
        await rejection(promises.setInterval(1, undefined, options).next(), "ERR_INVALID_ARG_TYPE");
    }
    await rejection(promises.setTimeout("1"), "ERR_INVALID_ARG_TYPE");
    await rejection(promises.setInterval("1").next(), "ERR_INVALID_ARG_TYPE");
    check(code(() => scheduler.yield.call({})) === "ERR_INVALID_THIS", "scheduler receiver");
    check(code(() => new scheduler.constructor()) === "ERR_ILLEGAL_CONSTRUCTOR", "scheduler constructor");
    clearTimeout(undefined);
    clearInterval(undefined);
    clearImmediate(undefined);

    let cancelled = false;
    const a = setTimeout(() => {
        cancelled = true;
    }, 1);
    const b = setInterval(() => {
        cancelled = true;
    }, 1);
    check(a.hasRef() && a.ref() === a, "ref");
    clearInterval(String(+a));
    clearTimeout(+b);
    const closed = setTimeout(() => {
        cancelled = true;
    }, 1);
    check(closed.close() === closed, "close identity");
    closed.refresh();
    const disposed = setTimeout(() => {
        cancelled = true;
    }, 1);
    disposed[Symbol.dispose]();
    const immediate = setImmediate(() => {
        cancelled = true;
    });
    clearImmediate(immediate);
    check(!immediate.hasRef(), "cleared immediate ref");
    const disposedImmediate = setImmediate(() => {
        cancelled = true;
    });
    disposedImmediate[Symbol.dispose]();

    await new Promise((resolve) => {
        const timer = setTimeout(
            function (x, y) {
                check(this === timer && x === 2 && y === "ok", "timeout arguments/receiver");
                resolve();
            },
            1,
            2,
            "ok",
        );
        check(timer.refresh() === timer, "refresh identity");
    });
    await new Promise((resolve) => {
        let count = 0;
        const timer = setTimeout(() => {
            if (++count === 1) {
                timer.refresh();
            } else {
                resolve();
            }
        }, 1);
    });
    await new Promise((resolve) => {
        let count = 0;
        const timer = setInterval(
            function (arg) {
                check(this === timer && arg === "tick", "interval receiver/args");
                if (++count === 3) {
                    clearInterval(timer);
                    resolve();
                }
            },
            1,
            "tick",
        );
    });
    const order = [];
    await new Promise((resolve) => {
        const first = setImmediate(function (arg) {
            check(this === first && arg === "first", "immediate receiver/args");
            order.push(arg);
            setImmediate(() => {
                order.push("nested");
                resolve();
            });
        }, "first");
        setImmediate(() => order.push("second"));
        queueMicrotask(() => order.push("microtask"));
    });
    check(order.join() === "microtask,first,second,nested", "immediate order");
    const value = {};
    check((await promises.setTimeout(1, value)) === value, "timeout value");
    check((await promises.setImmediate(value)) === value, "immediate value");
    check((await scheduler.wait(1)) === undefined && (await scheduler.yield()) === undefined, "scheduler");

    for (const start of [
        (signal) => promises.setTimeout(100, value, { signal }),
        (signal) => promises.setImmediate(value, { signal }),
        (signal) => promises.setInterval(100, value, { signal }).next(),
    ]) {
        const controller = new AbortController();
        const pending = start(controller.signal);
        controller.abort(value);
        await rejection(pending, "ABORT_ERR", value);
        await rejection(start(controller.signal), "ABORT_ERR", value);
    }
    let ticks = 0;
    for await (const item of promises.setInterval(1, value)) {
        check(item === value, "interval value");
        if (++ticks === 3) {
            break;
        }
    }
    const controller = new AbortController();
    const iterator = promises.setInterval(1, value, { signal: controller.signal });
    check(!(await iterator.next()).done, "interval initial tick");
    const next = iterator.next();
    controller.abort("stop");
    await rejection(next, "ABORT_ERR", "stop");
    check((await iterator.next()).done, "interval closed");

    const unrefTimer = setTimeout(() => {}, 100);
    check(code(() => unrefTimer.unref()) === "ERR_JCO_UNSUPPORTED_NODE_API", "unsupported unref");
    clearTimeout(unrefTimer);
    await rejection(promises.setTimeout(100, undefined, { ref: false }), "ERR_JCO_UNSUPPORTED_NODE_API");
    await rejection(promises.setImmediate(undefined, { ref: false }), "ERR_JCO_UNSUPPORTED_NODE_API");
    await rejection(promises.setInterval(100, undefined, { ref: false }).next(), "ERR_JCO_UNSUPPORTED_NODE_API");
    check(!cancelled, "cancelled callback ran");
    return JSON.stringify({ module: true, validation: true, scheduling: true });
}

// QuickJS cannot return a Promise through a synchronous WIT export. Its missing
// scheduler contract is synchronous; StarlingMonkey executes the async cases.
export function run() {
    if (typeof globalThis.setTimeout !== "function") {
        check(timers === namespace.default && timers.setTimeout === setTimeout, "module identity");
        check(promises === promiseTimers && timers.promises === promises, "promise identity");
        check(Object.keys(timers).length === 7 && Object.keys(promises).length === 4, "exports");
        for (const fn of [setTimeout, setInterval, setImmediate]) {
            check(code(() => fn(null)) === "ERR_INVALID_ARG_TYPE", "validation before scheduling");
            check(code(() => fn(() => {})) === "ERR_JCO_UNSUPPORTED_NODE_API", "missing timer");
        }
        check(code(() => scheduler.yield.call({})) === "ERR_INVALID_THIS", "scheduler receiver");
        clearTimeout(undefined);
        clearInterval(undefined);
        clearImmediate(undefined);
        return JSON.stringify({ module: true, validation: true, scheduling: "unavailable" });
    }
    return runAsync();
}
