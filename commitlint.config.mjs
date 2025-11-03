const config = {
    extends: ['@commitlint/config-conventional'],
    parserPreset: 'conventional-changelog-conventionalcommits',
    rules: {
        'type-enum': [
            2,
            'always',
            [
                'build',
                'chore',
                'ci',
                'debug',
                'docs',
                'feat',
                'fix',
                'perf',
                'refactor',
                'release',
                'revert',
                'style',
                'test',
            ],
        ],
        'scope-enum': [
            2,
            'always',
            [
                // General
                'deps',
                'examples',
                'ci',
                'ops',
                'docs',
                'tests',
                // Projects
                'jco',
                'bindgen',
                'p2-shim',
                'p3-shim',
                'transpile',
            ],
        ],
        'scope-case': [2, 'always', 'lower-case'],
        'body-max-line-length': [1, 'always', 100],
    },
};

export default config;
