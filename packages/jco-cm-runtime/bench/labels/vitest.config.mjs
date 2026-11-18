import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { defineConfig } from 'vitest/config';

const requireTranspile = createRequire(new URL('../../../jco-transpile/package.json', import.meta.url));
const { transform } = await import(pathToFileURL(requireTranspile.resolve('rolldown/experimental')).href);
const dropLabels = (process.env.JCO_RUNTIME_DROP_LABELS ?? 'DEBUG').split(',');

// Exercise the normal tests against runtime sources after label removal.
export default defineConfig({
    root: fileURLToPath(new URL('../../', import.meta.url)),
    plugins: [
        {
            name: 'strip-runtime-labels',
            enforce: 'pre',
            async transform(source, id) {
                if (!id.includes('/src/intrinsics/') || !id.endsWith('.ts')) {
                    return;
                }
                return transform(id, source, { lang: 'ts', dropLabels, sourcemap: true });
            },
        },
    ],
    test: {
        include: ['test/**/*.ts'],
        exclude: ['test/fixtures/**', 'test/**/*helpers.ts', 'test/vitest.ts'],
    },
});
