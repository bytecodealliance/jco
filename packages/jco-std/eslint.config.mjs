import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

import { default as parentConfig } from '../../eslint.config.mjs';

const config = defineConfig([
    parentConfig,
    tseslint.configs.recommended,
    globalIgnores([
        'dist',
        'src/wasi/0.2.x/generated/types/**/*.d.ts',
        'src/wasi/0.2.3/generated/types/**/*.d.ts',
        'src/wasi/0.2.6/generated/types/**/*.d.ts',
    ]),
]);

export default config;
