/*
 * Customize COMPONENT_FIXTURES env vars to use alternative test components
 * 
 * COMPONENT_FIXTURES is a comma-separated list of component names ending in
 * ".component.wasm".
 * 
 * Each of these components will then be passed through code generation and linting.
 * 
 * If a local runtime host.ts file is present for the component name in test/runtime/[name]/host.ts
 * then the runtime test will be performed against that execution.
 * 
 * When the runtime test is present, the flags in the runtime host.ts file will be used
 * as the flags of the code generation step.
 */
import { env, platform } from 'node:process';
import { readdir } from 'node:fs/promises';

const componentFixtures = env.COMPONENT_FIXTURES
  ? env.COMPONENT_FIXTURES.split(',')
  : (await readdir('test/fixtures/components')).filter(name => name !== 'dummy_reactor.component.wasm');

import { asyncBrowserTest } from './async.browser.js';
import { asyncTest } from './async.js';
import { browserTest } from './browser.js';
import { codegenTest } from './codegen.js';
import { runtimeTest } from './runtime.js';
import { commandsTest } from './commands.js';
import { apiTest } from './api.js';
import { cliTest } from './cli.js';
import { preview2Test } from './preview2.js';
import { witTest } from './wit.js';
import { tsTest } from './typescript.js';

await codegenTest(componentFixtures);
tsTest();
await preview2Test();
await runtimeTest(componentFixtures);
await commandsTest();
await apiTest(componentFixtures);
await cliTest(componentFixtures);
await witTest();
await asyncTest();
await asyncBrowserTest();

if (platform !== 'win32')
  await browserTest();
