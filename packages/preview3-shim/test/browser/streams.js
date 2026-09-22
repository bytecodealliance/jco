import { suite, test } from "vitest";

import { runBrowserCase } from "./common.js";

const cases = [
  {
    title: "component-exported closed stream",
    fixture: "streams/async-closed-stream.wasm",
    action: "closed-stream",
  },
];

suite("Preview 3 browser streams", () => {
  for (const browserCase of cases) {
    test.concurrent(browserCase.title, () => runBrowserCase(browserCase), 45_000);
  }
});
