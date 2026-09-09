import hooks, { performance, PerformanceMark, PerformanceObserver, timerify } from "node:perf_hooks";
import * as namespace from "node:perf_hooks";

export function run() {
    performance.clearMarks();
    performance.clearMeasures();
    performance.clearResourceTimings();
    const observer = new PerformanceObserver(() => {});
    let observation = true;
    try {
        observer.observe({ entryTypes: ["mark", "measure", "function", "resource"] });
    } catch (error) {
        observation = error.code;
    }
    const start = performance.mark("start", { startTime: 0 });
    performance.mark("end", { startTime: 7 });
    const measure = performance.measure("elapsed", "start", "end");
    const resource = performance.markResourceTiming(
        { startTime: 1, endTime: 4, encodedBodySize: 20, decodedBodySize: 30 },
        "https://example.test",
        "fetch",
        globalThis,
        "",
        {},
        200,
    );
    let missingMark;
    try {
        performance.measure("bad", "absent");
    } catch (error) {
        missingMark = error.name;
    }
    let histogram;
    try {
        hooks.createHistogram();
    } catch (error) {
        histogram = error.code;
    }
    let clock;
    try {
        clock = performance.now() >= 0;
    } catch (error) {
        clock = error.code;
    }
    let timed;
    try {
        timed = timerify((a, b) => a + b)(2, 3);
    } catch (error) {
        timed = error.code;
    }
    const records = observer.takeRecords();
    observer.disconnect();
    performance.clearMarks("start");
    return JSON.stringify({
        observation,
        identity: hooks.performance === performance && namespace.performance === performance,
        markClass: start instanceof PerformanceMark,
        zeroStart: start.startTime,
        duration: measure.duration,
        resourceSize: resource.transferSize,
        missingMark,
        histogram,
        clock,
        timed,
        records: records.map((entry) => entry.entryType),
        remainingMarks: performance.getEntriesByType("mark").map((entry) => entry.name),
    });
}
