import { writeFile } from 'node:fs/promises';
import { testDir } from './base.js';
import { resolve } from 'node:path';

await writeFile(resolve(testDir, 'bar.txt'), `'Twas brillig, and the slithy toves.\n`);
