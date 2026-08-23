import { suite, test } from 'vitest';

import { runP3CliFixture } from './helpers/cli.js';
import { setupP3CliFixture } from './helpers/fixtures.js';

suite('TCP streams stress', () => {
    for (let i = 0; i < 24; i++) {
        test.concurrent(`iteration ${i}`, async () => {
            const fixture = {
                path: 'sockets/p3-sockets-tcp-streams.wasm',
                title: `stress-${i}`,
            };
            const { esModuleHref, preopenDir, runnerArgs, cleanup } = await setupP3CliFixture(fixture);
            try {
                await runP3CliFixture({ esModuleHref, preopenDir, runnerArgs });
            } finally {
                await cleanup?.();
            }
        });
    }
});
