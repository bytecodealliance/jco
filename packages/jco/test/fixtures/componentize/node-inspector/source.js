import inspector from "node:inspector";
import { Session as PromisesSession } from "node:inspector/promises";

const notifications = [];

export async function run() {
    const results = {};
    results.consoleKeys = Object.keys(inspector.console).length;
    results.networkKeys = Object.keys(inspector.Network).length;

    // guest-side validation, before any host call
    const s = new inspector.Session();
    try {
        s.post(42);
    } catch (e) {
        results.badMethod = e.code;
    }
    try {
        s.post("Runtime.evaluate", { expression: "1" }, () => {});
    } catch (e) {
        results.postBeforeConnect = e.code;
    }

    // real host round trip through the promises Session (synchronous CDP responses)
    const p = new PromisesSession();
    p.connect();
    try {
        p.connect();
    } catch (e) {
        results.doubleConnect = e.code;
    }
    const evalResult = await p.post("Runtime.evaluate", { expression: "6 * 7" });
    results.evalValue = evalResult?.result?.value;
    try {
        await p.post("Nope.nope");
    } catch (e) {
        results.badCommand = e.code;
    }

    // register a notification listener; notifications are drained after run() returns
    p.on("inspectorNotification", (m) => notifications.push(m.method));
    await p.post("Runtime.enable");

    return JSON.stringify(results);
}

export function observed() {
    return JSON.stringify(notifications.length > 0);
}
