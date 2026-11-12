import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { suite, test } from "vitest";

const run = promisify(execFile);
const fixture = fileURLToPath(new URL("./fixtures/sockets/stream-lifecycle.mjs", import.meta.url));

// A child process bounds failures in synchronous WASI polling, which would otherwise
// block the test runner's event loop and prevent its timeout from firing.
suite("TCP shutdown", () => {
    test.concurrent.each(["client-send", "accepted-send", "receive", "both", "disposed-streams"])(
        "preserves stream lifecycle: %s",
        async (scenario) => {
            await run(process.execPath, [fixture, scenario], { timeout: 10_000 });
        },
    );
});
