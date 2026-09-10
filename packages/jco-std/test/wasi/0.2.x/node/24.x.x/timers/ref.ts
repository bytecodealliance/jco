import { execFileSync } from "node:child_process";
import { expect, test } from "vitest";

const moduleUrl = new URL(
  "../../../../../../dist/wasi/0.2.x/node/24.x.x/timers.js",
  import.meta.url,
).href;

test("unref and ref:false actually let a Node host exit with pending work", () => {
  const result = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import timers from ${JSON.stringify(moduleUrl)};
    timers.setTimeout(() => { throw new Error('timeout fired'); }, 60000).unref();
    timers.setInterval(() => { throw new Error('interval fired'); }, 60000).unref();
    timers.setImmediate(() => {}).unref();
    timers.promises.setTimeout(60000, undefined, { ref: false });
    timers.promises.setImmediate(undefined, { ref: false });
    timers.promises.setInterval(60000, undefined, { ref: false }).next();
    timers.promises.scheduler.wait(60000, { ref: false });
    console.log('ready');
  `,
    ],
    { encoding: "utf8", timeout: 5000 },
  );
  expect(result.trim()).toBe("ready");
});
