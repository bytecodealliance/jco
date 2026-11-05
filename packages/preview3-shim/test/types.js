import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { test } from "vitest";

const execute = promisify(execFile);

test.concurrent.each(["node", "browser"])(
  "package exports select %s declarations",
  async (target) => {
    await execute(process.execPath, [
      fileURLToPath(new URL("bin/tsc", import.meta.resolve("typescript/package.json"))),
      "--project",
      fileURLToPath(new URL(`./fixtures/types/${target}/tsconfig.json`, import.meta.url)),
    ]);
  },
);
