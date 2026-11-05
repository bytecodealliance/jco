import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { suite, test } from "vitest";

/** Run the compiler subprocess and capture its diagnostics. */
const EXECUTE = promisify(execFile);

suite("Preview 3 package declarations", () => {
  test.concurrent.each(["node", "browser"])(
    "package exports select %s declarations",
    async (target) => {
      await EXECUTE(process.execPath, [
        fileURLToPath(new URL("bin/tsc", import.meta.resolve("typescript/package.json"))),
        "--project",
        fileURLToPath(new URL(`./fixtures/types/${target}/tsconfig.json`, import.meta.url)),
      ]);
    },
  );
});
