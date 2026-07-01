import { fileURLToPath } from 'node:url';

import { nodeExec } from '../../helpers.js';

const CLI_RUNNER_PATH = fileURLToPath(new URL('../cli-runner.js', import.meta.url));

export function runP3CliFixture({ esModuleHref, preopenDir, runnerArgs }) {
    return nodeExec(CLI_RUNNER_PATH, esModuleHref, preopenDir, JSON.stringify(runnerArgs), { closeStdin: true });
}
