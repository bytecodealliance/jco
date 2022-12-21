import { strictEqual } from 'node:assert';
import { existsSync } from 'node:fs';
import { exec } from './helpers.js';

export async function runtimeTest (fixtures) {
  suite('Runtime', () => {
    
    for (const fixture of fixtures) {
      const runtimeJs = fixture.replace('.component.wasm', '.js');
      if (!existsSync(`test/output/${runtimeJs}`))
        continue;
      test(runtimeJs, async () => {
        const { stderr } = await exec(process.argv[0], `test/output/${runtimeJs}`);
        strictEqual(stderr, '');
      });
    }
  });
}
