import { suite, test } from "vitest";

import { runBrowserCase } from "./common.js";

const cases = [
  {
    title: "filesystem read/write",
    fixture: "fs/p3-filesystem-file-read-write.wasm",
  },
  {
    title: "OPFS component file read/write",
    fixture: "fs/p3-filesystem-file-read-write.wasm",
    action: "opfs-component",
    output: "OPFS component run completed",
  },
  {
    title: "OPFS persistence and symlinks",
    fixture: "fs/p3-filesystem-file-read-write.wasm",
    action: "opfs-persistence",
    output: "OPFS persistence verified",
  },
];

suite("Preview 3 browser filesystem", () => {
  for (const browserCase of cases) {
    test.concurrent(browserCase.title, () => runBrowserCase(browserCase), 45_000);
  }
});
