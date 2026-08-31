import { fileURLToPath } from 'node:url';

import { testBrowser } from './test/browser-harness.js';
import { testNativeHostProtocol } from './test/protocol.js';

const launcher = fileURLToPath(new URL('./scripts/launch-host.mjs', import.meta.url));

await testNativeHostProtocol(launcher);
await testBrowser('firefox', launcher);
await testBrowser('chromium', launcher);
