import { fileURLToPath } from 'node:url';
import { filesystem } from '@bytecodealliance/preview2-shim';

filesystem._setPreopens({ '/data': fileURLToPath(new URL('../data/', import.meta.url)) });
const { run } = await import('../dist/transpiled/component.js');
run.run();
