import { suite, test } from "vitest";

import { runBrowserCase } from "./common.js";

const cases = [
  {
    title: "HTTP GET",
    fixture: "http/p3-http-outbound-request-get.wasm",
  },
  {
    title: "HTTP POST body",
    fixture: "http/p3-http-outbound-request-post.wasm",
  },
  {
    title: "HTTP invalid header error",
    fixture: "http/p3-http-outbound-request-invalid-header.wasm",
  },
];

suite("Preview 3 browser HTTP", () => {
  for (const browserCase of cases) {
    test.concurrent(browserCase.title, () => runBrowserCase(browserCase), 45_000);
  }
});
