import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chdir, argv } from "node:process";
import { createTracing, getEnabledCategories } from "node:trace_events";

// Isolate the real Node trace writer's files from other tests and the source tree.
chdir(argv[3]);

const component = await import(argv[2]);

assert.equal(component.contract(), 29);

if (argv[4] === "denied") {
    assert.equal(component.denied(), "ERR_JCO_TRACE_EVENTS_ADAPTER_REQUIRED,ERR_JCO_TRACE_EVENTS_ADAPTER_REQUIRED");
} else {
    assert.equal(getEnabledCategories(), undefined);
    assert.equal(component.lifecycle(), 10);

    // A component shares the host's real tracing agent with ordinary Node users.
    const native = createTracing({ categories: ["jco.host.baseline"] });

    native.enable();

    try {
        assert.equal(component.lifecycle(), 10);
        assert.equal(getEnabledCategories(), "jco.host.baseline");

        component.startTracing();
        readFileSync(new URL("./source.wit", import.meta.url));
        component.stopTracing();

        assert.equal(getEnabledCategories(), "jco.host.baseline");
    } finally {
        component.stopTracing();
        native.disable();
    }

    assert.equal(getEnabledCategories(), undefined);
}

console.log("Trace events component OK");
