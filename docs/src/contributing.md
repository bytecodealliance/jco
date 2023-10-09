# Contributing

Development is based on a standard `npm install && npm run build && npm run test` workflow.

Tests can be run without bundling via `npm run build:dev && npm run test:dev`.

Specific tests can be run adding the mocha `--grep` flag, for example: `npm run test:dev -- --grep exports_only`.
