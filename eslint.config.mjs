import { defineConfig, globalIgnores } from 'eslint/config';
//import tseslint from 'typescript-eslint';

const config = defineConfig(
    [
        // TODO: re-enable once switched to typescript
        //tseslint.configs.recommended,
        globalIgnores([
            'test/output/**/*.js',
        ]),
        {
            rules: {
                indent: ['error', 4],
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
            },
        },
    ]
);

export default config;
