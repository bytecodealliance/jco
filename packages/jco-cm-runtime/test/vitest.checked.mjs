import { transform } from 'rolldown/experimental';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const dropLabels = (process.env.JCO_RUNTIME_DROP_LABELS ?? 'DEBUG').split(',');

// Exercise the behavior suite with the same label removal as the checked build.
export default defineConfig({
    root: fileURLToPath(new URL('../', import.meta.url)),
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
        sequence: { concurrent: true },
        include: ['test/**/*.ts'],
        // Package/profile tests build their own artifacts and run in the normal suite.
        exclude: [
            'test/fixtures/**',
            'test/**/*helpers.ts',
            'test/vitest*.ts',
            'test/package.ts',
            'test/build-profiles.ts',
        ],
    },
});
