# Runtime release conformance

`../test-jco-cm-runtime-release.mjs` runs the checks against an installed runtime:

```sh
node smoke.mjs
node smoke.mjs --runtime-base @example/cm-runtime
node smoke.mjs --runtime-base ./runtime/dist --group resource
```

The default base is `@bytecodealliance/jco-cm-runtime`. Package bases use their
public exports; directory and file URL bases load `index.js`, `runtime.js`, and
`intrinsics/<family>.js`. Relative directories resolve from the working directory.
Repeat `--group` to select multiple groups. The runtime API version is always
checked, including when only an intrinsic family is selected.

The entry point and this directory are copied together beside the installed
package by the release workflow and the package-consumer test.

Each family module exports its individual intrinsic tests and a family function
that accepts `{ load, runtime }`. Register family functions or future cross-family
groups in `TEST_GROUPS` in `index.mjs`; the CLI needs no additional test logic.
Tests should create their own state and use public runtime exports. The caller
can also import `runRuntimeConformance` and supply `{ base, groups }` directly.
