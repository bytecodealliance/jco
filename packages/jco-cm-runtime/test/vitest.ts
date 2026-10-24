import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['test/**/*.ts'],
        exclude: ['test/fixtures/**', 'test/helpers.ts', 'test/vitest.ts'],
    },
});
