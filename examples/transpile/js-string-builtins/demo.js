import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const DIST_DIR = new URL('./dist/', import.meta.url);
const compileOptions = {
    builtins: ['js-string'],
    importedStringConstants: '_',
};

const remainingCoreImports = [];

// Jco's manual instantiation mode calls this hook once for each core Wasm
// module in the component. The JS String Builtins proposal is enabled at
// compile time, so this is the right place to provide its options.
async function getCoreModule(path) {
    const bytes = await readFile(new URL(path, DIST_DIR));
    const module = await WebAssembly.compile(bytes, compileOptions);
    remainingCoreImports.push(...WebAssembly.Module.imports(module));
    return module;
}

const { instantiate } = await import(new URL('palindrome.js', DIST_DIR));
const component = await instantiate(getCoreModule, {});

// Proposal imports are eagerly linked during compilation and therefore do not
// remain as imports that Jco must provide when it instantiates the core module.
assert.equal(
    remainingCoreImports.some(({ module }) => module === 'wasm:js-string'),
    false,
);
assert.equal(
    remainingCoreImports.some(({ module }) => module === '_'),
    false,
);

assert.equal(component.racecarIsPalindrome(), true);
assert.equal(component.helloIsPalindrome(), false);

console.log('racecar is a palindrome: true');
console.log('hello is a palindrome: false');
