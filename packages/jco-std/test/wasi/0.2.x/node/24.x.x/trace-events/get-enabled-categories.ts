import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const core = new URL(
  "../../../../../../dist/wasi/0.2.x/node/24.x.x/trace-events/core.js",
  import.meta.url,
).href;

const host = new URL(
  "../../../../../../dist/wasi/0.2.x/node/24.x.x/trace-events-host-node.js",
  import.meta.url,
).href;

// Native tracing changes process-wide state and writes files on exit. Each oracle
// runs in a fresh process so it cannot affect other tests or leak enabled categories.
describe.skipIf(process.versions.node.split(".")[0] !== "24")("Node 24 host tracing", () => {
  test("preserves category unions, CLI categories, native warnings and trace output", () => {
    const directory = mkdtempSync(join(tmpdir(), "jco-trace-events-"));
    const source = `
      import assert from 'node:assert/strict';
      import { readFileSync } from 'node:fs';
      import * as native from 'node:trace_events';
      import { createTraceEvents } from ${JSON.stringify(core)};
      import * as host from ${JSON.stringify(host)};

      const api = createTraceEvents(host);
      const warnings = [];
      process.on("warning", (warning) => warnings.push(warning.message));
      const first = api.createTracing({ categories: ['z', 'a', 'a'] });
      const second = native.createTracing({ categories: ['a', 'node.fs.sync'] });

      assert.equal(api.getEnabledCategories(), 'cli.category');
      first.enable();
      first.enable();
      second.enable();
      assert.equal(api.getEnabledCategories(), 'a,cli.category,node.fs.sync,z');
      assert.equal(api.getEnabledCategories(), native.getEnabledCategories());

      first.disable();
      assert.equal(api.getEnabledCategories(), 'a,cli.category,node.fs.sync');
      readFileSync(new URL(${JSON.stringify(core)}));
      second.disable();
      assert.equal(api.getEnabledCategories(), 'cli.category');

      // Node retains active tracing objects and emits its own >10-objects warning.
      const sessions = Array.from({ length: 11 }, (_, i) => api.createTracing({ categories: ['warning.' + i] }));
      for (const session of sessions) session.enable();
      for (const session of sessions) session.disable();
      assert.equal(api.getEnabledCategories(), 'cli.category');
      await new Promise(setImmediate);
      assert.deepEqual(warnings, ['Possible trace_events memory leak detected. There are more than 10 enabled Tracing objects.']);
      console.log('ok');
    `;

    try {
      const output = execFileSync(
        process.execPath,
        ["--trace-event-categories=cli.category", "--input-type=module", "-e", source],
        { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );

      expect(output.trim()).toBe("ok");

      const trace = JSON.parse(readFileSync(join(directory, "node_trace.1.log"), "utf8")) as {
        traceEvents: Array<{ cat: string }>;
      };

      expect(trace.traceEvents.some((event) => event.cat.includes("node.fs.sync"))).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("an empty host reports undefined and a dropped resource disables its categories", () => {
    const directory = mkdtempSync(join(tmpdir(), "jco-trace-drop-"));
    const source = `
      import assert from 'node:assert/strict';
      import { createTraceEvents } from ${JSON.stringify(core)};
      import * as host from ${JSON.stringify(host)};

      const api = createTraceEvents(host);
      assert.equal(api.getEnabledCategories(), undefined);
      const session = host.TraceSession.start(['jco.resource']);
      assert.equal(api.getEnabledCategories(), 'jco.resource');
      session[Symbol.dispose]();
      assert.equal(api.getEnabledCategories(), undefined);
      session[Symbol.dispose]();
    `;

    try {
      execFileSync(process.execPath, ["--input-type=module", "-e", source], {
        cwd: directory,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
