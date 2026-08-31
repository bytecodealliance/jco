import { fileURLToPath } from 'node:url';

import { testBrowser } from './test/browser-harness.js';
import { testNativeHostProtocol } from './test/protocol.js';

const launcher = fileURLToPath(new URL('./scripts/launch-host.mjs', import.meta.url));

await Promise.all([
    testNativeHostProtocol(launcher),
    testBrowser('firefox', launcher),
    testBrowser('chromium', launcher),
]);
