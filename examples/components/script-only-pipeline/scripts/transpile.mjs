import { execFileSync } from 'node:child_process';

// The engine and data initializer are known at build time. Processing scripts are
// deliberately left as .wasm files so both hosts can load them at runtime.
for (const name of ['engine', 'dataset']) {
    execFileSync(
        'jco',
        [
            'transpile',
            `dist/components/${name}.wasm`,
            '--name',
            name,
            '--instantiation',
            'async',
            '-o',
            `dist/transpiled/${name}`,
        ],
        { stdio: 'inherit' },
    );
}
