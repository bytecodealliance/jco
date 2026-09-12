import tracing, { createTracing, getEnabledCategories } from "node:trace_events";
import * as namespace from "node:trace_events";

function check(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

export function contract() {
    let checks = 0;

    function verify(condition, message) {
        check(condition, message);
        checks++;
    }

    verify(namespace.default === tracing, "default identity");
    verify(namespace.createTracing === createTracing, "factory identity");
    verify(tracing.getEnabledCategories === getEnabledCategories, "query identity");
    verify(Object.keys(tracing).sort().join() === "createTracing,getEnabledCategories", "default keys");
    verify(Object.keys(namespace).sort().join() === "createTracing,default,getEnabledCategories", "namespace keys");

    const categories = ["b", "a", "a"];
    const instance = createTracing({ categories });
    const prototype = Object.getPrototypeOf(instance);

    verify(instance.enabled === false, "initial state");
    verify(instance.categories === "b,a,a", "category order and duplicates");
    verify(Object.keys(instance).length === 0, "private state");
    verify(prototype.constructor.name === "Tracing", "constructor name");
    verify(Object.getOwnPropertyDescriptor(prototype, "enabled").set === undefined, "readonly state");
    verify(Object.getOwnPropertyDescriptor(prototype, "categories").enumerable === false, "category descriptor");
    verify(Object.getOwnPropertyDescriptor(prototype, "enable").writable === true, "method descriptor");
    verify(instance.disable() === undefined, "initial disable");

    categories.push("changed");
    verify(instance.categories === "b,a,a,changed", "live category display");
    verify(createTracing({ categories: [""] }).categories === "", "empty category name");

    for (const options of [
        undefined,
        null,
        false,
        1,
        "options",
        [],
        {},
        { categories: "node" },
        { categories: [1] },
        { categories: [null] },
        { categories: Array(1) },
    ]) {
        let error;

        try {
            createTracing(options);
        } catch (caught) {
            error = caught;
        }

        verify(error instanceof TypeError && error.code === "ERR_INVALID_ARG_TYPE", "invalid options");
    }

    let emptyError;

    try {
        createTracing({ categories: [] });
    } catch (caught) {
        emptyError = caught;
    }

    verify(emptyError?.code === "ERR_TRACE_EVENTS_CATEGORY_REQUIRED", "empty list code");
    verify(emptyError?.message === "At least one category is required", "empty list message");

    let coerced = false;

    try {
        createTracing({
            categories: [
                {
                    toString() {
                        coerced = true;
                        return "node";
                    },
                },
            ],
        });
    } catch {}

    verify(coerced === false, "strict string validation");

    return checks;
}

export function denied() {
    const instance = createTracing({ categories: ["node.fs.sync"] });
    const errors = [];

    for (const operation of [() => instance.enable(), () => getEnabledCategories()]) {
        try {
            operation();
        } catch (error) {
            errors.push(error.code);
        }
    }

    check(instance.enabled === false, "denied enable changed state");
    instance.disable();

    return errors.join(",");
}

export function lifecycle() {
    const baseline = getEnabledCategories();
    const categories = ["jco.trace.b", "jco.trace.a", "jco.trace.a"];
    const first = createTracing({ categories });
    const second = createTracing({ categories: ["jco.trace.a"] });
    let checks = 0;

    function verify(condition, message) {
        check(condition, message);
        checks++;
    }

    function withBaseline(...added) {
        return [...new Set([...(baseline ? baseline.split(",") : []), ...added])].sort().join(",") || undefined;
    }

    categories.splice(0, 3, "changed");

    try {
        verify(first.enable() === undefined, "enable return");
        verify(first.enabled, "enabled state");
        verify(first.categories === "changed", "display mutation");
        verify(getEnabledCategories() === withBaseline("jco.trace.a", "jco.trace.b"), "captured snapshot");

        first.enable();
        second.enable();
        verify(getEnabledCategories() === withBaseline("jco.trace.a", "jco.trace.b"), "overlapping union");

        first.disable();
        first.disable();
        verify(!first.enabled, "disabled state");
        verify(getEnabledCategories() === withBaseline("jco.trace.a"), "remaining owner");

        second.disable();
        verify(getEnabledCategories() === baseline, "restore baseline");

        first.enable();
        verify(getEnabledCategories() === withBaseline("jco.trace.a", "jco.trace.b"), "reenable snapshot");
    } finally {
        first.disable();
        second.disable();
    }

    verify(getEnabledCategories() === baseline, "final cleanup");

    return checks;
}

const capture = createTracing({ categories: ["node.fs.sync"] });

export function startTracing() {
    capture.enable();
}

export function stopTracing() {
    capture.disable();
}
