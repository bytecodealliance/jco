import { exec } from './helpers.js';
import { strictEqual } from 'node:assert';

const tscPath = 'node_modules/typescript/bin/tsc';

// always do TS generation
let promise;
export function tsGenerationPromise() {
  if (promise) return promise;
  return promise = (async () => {
    var { stderr } = await exec(tscPath, '-p', 'test/tsconfig.json');
    strictEqual(stderr, '');
  })();
}

// TypeScript tests _must_ run after all codegen to complete successfully
// This is due to type checking against generated bindings
export function tsTest () {
  suite(`TypeScript`, () => {
    test('Verify Typescript output', async () => {
      await tsGenerationPromise();
    });
  });
}