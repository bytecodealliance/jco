import { describe, bench } from "vitest";
import { ResourceWorker } from "../lib/nodejs/workers/resource-worker.js";

const _worker = new ResourceWorker(new URL("./nop-worker.js", import.meta.url));

describe("ResourceWorker round-trip", () => {
  bench(
    "async run nop",
    async () => {
      await _worker.run({ op: "nop" });
    },
    { time: 1000 },
  );

  bench(
    "sync run noop",
    () => {
      _worker.runSync({ op: "nop" });
    },
    { time: 1000 },
  );
});
