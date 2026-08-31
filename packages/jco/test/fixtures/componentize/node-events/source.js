import events, {
    EventEmitter,
    getEventListeners,
    getMaxListeners,
    listenerCount,
    once,
    setMaxListeners,
} from "node:events";

export function run() {
    const emitter = new EventEmitter();
    const seen = [];
    emitter.on("x", (value) => seen.push(value));
    emitter.prependListener("x", () => seen.push("first"));
    emitter.once("y", () => seen.push("once"));
    emitter.emit("x", 1);
    emitter.emit("y");
    emitter.emit("y");

    let errored = "no";
    try {
        emitter.emit("error", new Error("boom"));
    } catch {
        errored = "threw";
    }

    // The three unenv ships as stubs, exercised through the component rather than only in unit
    // tests: `listenerCount` and `setMaxListeners` throw when called, and `getMaxListeners`
    // throws on an EventTarget.
    const target = new EventTarget();
    setMaxListeners(4, target);
    const limited = new EventEmitter();
    setMaxListeners(7, limited);
    const originalDefault = events.defaultMaxListeners;
    setMaxListeners(3);
    const defaultApplied = new EventEmitter().getMaxListeners();
    setMaxListeners(originalDefault);

    let badTarget = "no";
    try {
        setMaxListeners(1, {});
    } catch (error) {
        badTarget = error.code;
    }
    let badRange = "no";
    try {
        setMaxListeners(-1);
    } catch (error) {
        badRange = error.code;
    }

    return JSON.stringify({
        seen,
        listenerCount: listenerCount(emitter, "x"),
        staticListenerCount: events.listenerCount(emitter, "x"),
        eventNames: emitter.eventNames(),
        getEventListeners: getEventListeners(emitter, "x").length,
        maxOnTarget: getMaxListeners(target),
        maxOnEmitter: getMaxListeners(limited),
        defaultApplied,
        badTarget,
        badRange,
        moduleIsClass: events === EventEmitter,
        staticOnce: typeof once,
        errored,
    });
}
