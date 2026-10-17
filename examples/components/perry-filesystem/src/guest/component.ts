import { readFileSync, statSync } from 'node:fs';

// Perry lowers these Node-style calls to WASI P2 filesystem operations.
const input: string = readFileSync('/data/input.txt', 'utf8');
console.log(`Perry size: ${statSync('/data/input.txt').size}`);
console.log(`Perry read: ${input}`);
