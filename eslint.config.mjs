import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-plugin-prettier';
import { default as prettierConfig } from './prettier.config.mjs';

const config = defineConfig([
    globalIgnores(['test/output/**/*.js']),
    {
        plugins: {
            prettier,
        },
        rules: {
            'no-sparse-arrays': 0,
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'no-fallthrough': 0,
            'no-constant-condition': 0,
            curly: ['error', 'all'],
            'space-before-function-paren': [
                'error',
                {
                    anonymous: 'never',
                    named: 'never',
                    asyncArrow: 'always',
                },
            ],

            // NOTE: for some reason, prettier defaults are now 'function ()',
            // so we use prettier fo format and eslint *after* to fix up issues.
            //
            // https://github.com/prettier/prettier/issues/1139
            // https://github.com/prettier/prettier/issues/3847
            // https://github.com/prettier/prettier/issues/3845
            'prettier/prettier': ['off', prettierConfig],
        },
    },
]);

export default config;
