import { defineConfig, globalIgnores } from 'eslint/config';

import { default as parentConfig } from '../../eslint.config.mjs';

const config = defineConfig([
    parentConfig,
    globalIgnores([
        'src/wasi/0.2.x/generated/types/**/*.d.ts',
    ]),
]);

export default config;
