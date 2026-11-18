import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        sequence: { concurrent: true },
        include: ['test/**/*.ts'],
        exclude: ['test/fixtures/**', 'test/**/*helpers.ts', 'test/vitest*.ts'],
    },
});
