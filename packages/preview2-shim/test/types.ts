import { join } from "node:path";

import { suite, test } from "vitest";

import { tsCodegen, FIXTURES_TYPES_DIR } from "./common.js";

suite("preview2-shim types", () => {
  test("interface namespaces are exposed", async () => {
    tsCodegen({
      tsConfigPath: join(FIXTURES_TYPES_DIR, "iface-namespaces-at-runtime/tsconfig.test.json"),
    });
  });
});
