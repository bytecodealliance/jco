import { fileURLToPath } from "node:url";

import { exec } from "../../helpers.js";

const CLI_RUNNER_PATH = fileURLToPath(new URL("../cli-runner.js", import.meta.url));

export function runP3CliFixture({ esModuleHref, preopenDir, runnerArgs }) {
    return exec(CLI_RUNNER_PATH, esModuleHref, preopenDir, JSON.stringify(runnerArgs), { closeStdin: true });
}
