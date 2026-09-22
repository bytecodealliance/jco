import { suite, test } from "vitest";

import { runBrowserCase } from "./common.js";

const cases = [
  {
    title: "CLI stdout and post-return",
    fixture: "cli/p3-cli-hello-stdout-post-return.wasm",
    output: "hello, world",
  },
  {
    title: "monotonic clock wait",
    fixture: "clocks/p3-clocks-sleep.wasm",
  },
  {
    title: "secure and insecure random",
    fixture: "random/p3-random-imports.wasm",
  },
];

suite("Preview 3 browser CLI, clocks, and random", () => {
  for (const browserCase of cases) {
    test.concurrent(browserCase.title, () => runBrowserCase(browserCase), 45_000);
  }
});
