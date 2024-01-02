import { chmodSync } from 'node:fs';
import { resolve } from 'node:path';

process.on('exit', () => {
  chmodSync(testDir, 0o777);
  chmodSync(resolve(testDir, 'bar.txt'), 0o777);
});

const { testDir } = await import('./base.js');

chmodSync(resolve(testDir, 'bar.txt'), 0o555);
chmodSync(testDir, 0o555);
