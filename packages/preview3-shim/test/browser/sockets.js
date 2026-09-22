import { suite, test } from "vitest";

import { runBrowserCase } from "./common.js";

const cases = [
  {
    title: "unsupported DNS reports a stable WASI error",
    fixture: "sockets/p3-sockets-ip-name-lookup.wasm",
    error: "not-supported",
  },
  {
    title: "configurable in-memory socket providers",
    fixture: "cli/p3-cli-hello-stdout.wasm",
    action: "socket-providers",
    output: "socket providers verified",
  },
];

suite("Preview 3 browser sockets", () => {
  for (const browserCase of cases) {
    test.concurrent(browserCase.title, () => runBrowserCase(browserCase), 45_000);
  }
});
