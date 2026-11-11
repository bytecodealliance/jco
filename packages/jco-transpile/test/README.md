# Transpilation tests

Build the local transpiler and fixtures with the usual workspace build before
running these suites.

Run the tests with the default inline runtime:

```sh
pnpm --filter @bytecodealliance/jco-transpile test
```

All test commands accept Vitest filters and options.

## Testing the external runtime

Build the local Component Model runtime and run the same tests against it:

```sh
pnpm --filter @bytecodealliance/jco-cm-runtime build
pnpm --filter @bytecodealliance/jco-transpile test:external-runtime
```

The `test:lts:external-runtime` and `test:extended:external-runtime` commands run
the corresponding LTS and extended suites. CI runs the transpilation test matrix
with the inline and external runtime modes.

Run the same tests against any other runtime that provides the same modules by
naming its module base in `JCO_TEST_RUNTIME_CUSTOM_MODULE_BASE`:

```sh
JCO_TEST_RUNTIME_CUSTOM_MODULE_BASE=/home/me/my-runtime/dist \
    pnpm --filter @bytecodealliance/jco-transpile test:custom-runtime
```

The base is the location that holds the runtime's `runtime` module, with its
`intrinsics/*` modules beside it.
It takes one of these forms:

```sh
# A directory, relative to packages/jco-transpile (where pnpm runs the script)
JCO_TEST_RUNTIME_CUSTOM_MODULE_BASE=../../../my-runtime/dist

# An absolute directory
JCO_TEST_RUNTIME_CUSTOM_MODULE_BASE=/home/me/my-runtime/dist

# A file: URL
JCO_TEST_RUNTIME_CUSTOM_MODULE_BASE=file:///home/me/my-runtime/dist/

# An installed package that exports a "runtime" subpath
JCO_TEST_RUNTIME_CUSTOM_MODULE_BASE=@my-scope/my-runtime

# An HTTP(S) URL, which needs a module loader that can import over HTTP(S)
JCO_TEST_RUNTIME_CUSTOM_MODULE_BASE=https://example.com/my-runtime/dist/
```

Browser tests serve the runtime from the test server, so they need one of the
directory or `file:` forms.

The `test:lts:custom-runtime` and `test:extended:custom-runtime` commands run the
other suites. Tests under `test/external-runtime` wrap modules of the workspace
runtime, so they need it built in every mode.

`JCO_TEST_RUNTIME` selects the mode through `test/transpilation.ts`: `inline`
(the default), `external` for the local built runtime, or `custom` for the base
named by `JCO_TEST_RUNTIME_CUSTOM_MODULE_BASE`. Use that module's `transpile` and `transpileBytes`
exports in tests; `setupAsyncTest` uses them too. The normal mode is `inline`.
Explicit `cmRuntimeEsModule` options override the suite selection, including
`undefined` for assertions specifically about inline code generation.

Node tests use an absolute file URL so generated modules in temporary
directories can resolve the provider. Browser tests serve a copy of the runtime
beside their generated components. Runtime fixture output directories are
separate for the two modes.

Bundled runtime correctness and performance checks live separately under
`bench/external-runtime`; normal, LTS and extended test discovery does not include
them. After building the transpiler, runtime and generated fixtures, run
`pnpm --filter @bytecodealliance/jco-transpile bench:external-runtime:verify`
for the complete portfolio's bundled known answers and integrity canaries.
Run timing measurements serially with `bench:external-runtime:smoke` or
`bench:external-runtime` after functional tests finish.
