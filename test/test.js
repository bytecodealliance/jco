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
import { env } from 'node:process';
import { readdir } from 'node:fs/promises';

const componentFixtures = env.COMPONENT_FIXTURES
  ? env.COMPONENT_FIXTURES.split(',')
  : (await readdir('test/fixtures')).filter(name => name.endsWith('.component.wasm') && !name.startsWith('dummy_') && !name.startsWith('dummy_'));

import { codegenTest } from './codegen.js';
import { runtimeTest } from './runtime.js';
import { apiTest } from './api.js';
import { cliTest } from './cli.js';

await codegenTest(componentFixtures);
await runtimeTest(componentFixtures);
await apiTest(componentFixtures);
await cliTest(componentFixtures);
