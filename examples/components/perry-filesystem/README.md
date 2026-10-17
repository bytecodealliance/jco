# [Perry](https://github.com/PerryTS/perry) filesystem component

This example builds a WebAssembly component from TypeScript, then runs it on
Node.js with Jco. The component reads a host file and its size through WASI
Preview 2 filesystem interfaces.

## How it works

The guest in [`src/guest/component.ts`](./src/guest/component.ts) uses
`readFileSync` and `statSync` from `node:fs`. Perry compiles these calls to
WASI P2; Jco does not inject its Node.js compatibility adapters or bundle the
source for this backend.

Perry supplies the component's `wasi:cli/run` export. After `jco transpile`,
the [demo script](./scripts/demo.mjs) maps the example's `data/` directory to
`/data` using the [Preview 2 shim][p2-shim], imports the generated component, and
calls its `run` export. The file is read when the component runs.

The project follows the same guest/build/demo layout as the other component
examples:

| Path | Purpose |
| --- | --- |
| `src/guest/component.ts` | TypeScript guest source compiled by Perry. |
| `scripts/` | Type generation, component build, and Node.js demo scripts. |
| `data/input.txt` | Sample host file exposed to the guest as `/data/input.txt`. |
| `wit/` | Generated copy of Jco's bundled WASI P2 command world. |
| `generated/types/` | Generated guest declarations for that reference world. |
| `dist/component.wasm` | Compiled component. |
| `dist/transpiled/` | JavaScript and core Wasm produced by Jco. |

`wit/`, `generated/`, and `dist/` are generated and ignored by Git.
For background on components and WASI, see the [Component Model Book][cm-book].

## Prerequisites

Complete the repository's [normal build/setup][contributing] first. This example
uses the current checkout's Jco CLI because the Perry backend is not yet in a
published Jco release. From the repository root, build its JavaScript:

```console
pnpm --filter @bytecodealliance/jco build:ts
```

You also need a **WASI-enabled Perry compiler**, its matching runtime archive,
and wasi-sdk. The published `@perryts/perry@0.5.1520` package predates the WASI
target. Follow the [Perry backend guide][perry-guide] for the tested source
revision and toolchain setup, including `WASI_SDK_PATH` and `PERRY_RUNTIME_DIR`.

Perry is deliberately absent from this example's dependencies. You select a
source-built executable or install a compiler package yourself. Use a Node.js
version supporting the Wasm instructions emitted by that compiler; this example
has been validated on Node 24.21.0 without experimental flags.

## Quickstart

After configuring the compiler toolchain, run from the repository root:

```sh
cd examples/components/perry-filesystem
pnpm install
JCO_PERRY_CLI_PATH=/absolute/path/to/perry pnpm run all
```

This example is a pnpm workspace member. Installing dependencies does not install
Perry: provision its compiler and runtime before running this example or the
repository-wide example sweep.

The `all` script will:

- Copy the bundled WASI P2 reference world and generate guest declarations.
- Compile the TypeScript guest with the selected Perry executable.
- Transpile the component into `dist/transpiled/`.
- Run the Node.js demo against `data/input.txt`.

<details>
<summary><h4>Expected output</h4></summary>

After the build and transpilation output, the demo prints:

```text
Perry size: 26
Perry read: hello from the filesystem
```

</details>

If a WASI-enabled `@perryts/perry` package is installed in this project, leave
`JCO_PERRY_CLI_PATH` unset and run `pnpm run all`. The environment variable is
a convenience provided by this example's build script; the Jco CLI's direct
selection option is `--backend-perry-cli-path`.

## Step-by-step

### Install dependencies and select the compiler

From this example directory, install the Preview 2 shim:

```console
pnpm install
```

To use a project-installed compiler, install your chosen WASI-enabled package
explicitly, for example `pnpm add --save-dev /path/to/perry-cli-package`.
Its manifest must expose a `perry` executable as described in the
[backend guide][perry-guide]. A source-built executable can instead be selected
by path in the build step below.

### Generate WIT declarations

```console
pnpm run gen:types
```

The script uses `jco scaffold` in a temporary directory to copy
`builtin:wasi-command@0.2.x` into `wit/`, then runs `jco guest-types` to write
`generated/types/`. The temporary scaffold is removed afterward. Re-running
the script refreshes the reference WIT from Jco's bundled snapshot.

These declarations describe WASI interfaces; they are not Perry runtime bindings.
Perry does not yet support custom WIT bindings, so componentization does not take
`--wit` or `--world-name`. The compiler and its SDK determine the WASI patch
versions in the resulting component.

### Build the WebAssembly component

Compile with an explicit executable:

```console
pnpm run build:component --backend-perry-cli-path /absolute/path/to/perry
```

Alternatively, set `JCO_PERRY_CLI_PATH` for the build script or run
`pnpm run build:component` with the compiler installed as `@perryts/perry`.
For an aliased/local package, use
`pnpm run build:component --backend-perry-package my-perry`.
Explicit selectors override the example's environment variable. Relative CLI
paths are resolved from this example directory.

The script creates `dist/` and writes `dist/component.wasm`.
`pnpm run build` combines declaration generation and componentization.
Jco first checks that the selected compiler can generate WASI code and reports
the executable path and compiler diagnostics if the check fails.

#### Aside: inspect the component's WASI interfaces

From this example directory:

```console
node ../../../packages/jco/dist/jco.js wit dist/component.wasm
```

The output includes imports such as `wasi:filesystem/types@0.2.x` and
`wasi:filesystem/preopens@0.2.x`, plus the `wasi:cli/run@0.2.x` export.
The host provides those filesystem capabilities through the Preview 2 shim.

### Transpile the WebAssembly component for Node.js

```console
pnpm run transpile
```

This produces `dist/transpiled/component.js` and its core Wasm files. The script
passes `--bindgen-enable-wasm-exnref` because the tested Perry runtime emits Wasm
exception instructions. This is a Jco transpiler option; Node itself does not
need experimental flags for this example.

## Run the Demo

```console
pnpm run demo
```

The demo maps only this example's `data/` directory into the guest filesystem.
Edit [`data/input.txt`](./data/input.txt) and run the demo again to see the new
contents and byte size, without rebuilding the component.

The [real Perry E2E suite][perry-tests] uses the same guest and demo files.
It creates input only after compilation and changes it between two ordinary Node
runs to verify that the guest accesses the host filesystem at runtime.
Additional mutation fixtures exercise writes and directory operations with the
built workspace shim's `enableMutateDirectory` option, including a check that
the same component fails with the default shim settings.

## Continuous integration

The normal test workflow runs this example's `all` script and the real Perry
E2E suite in the `examples-perry` job on Ubuntu 24.04 / Node 24.
Until a WASI-enabled compiler is released,
[the CI build recipe](../../../scripts/ci/build-perry-wasi.sh) builds Perry from
a fixed source revision with a pinned Rust toolchain and checksum-verified WASI
SDK. It caches the finished compiler, matching WASI runtime archive, and SDK.

The cache key includes the runner architecture and build recipe, so changing a
pin or build command invalidates it. Cache hits skip the source build entirely.
The cache is saved before running the example so a Jco test failure does not
force a compiler rebuild on the next run.

## Potential Issues

- **Compiler lacks WASI support:** `--target wasm` is a different Perry target.
  Select a compiler built with `target-wasi`, not the older npm release.
- **Missing runtime or SDK:** the capability probe does not link the runtime.
  The full build still needs the matching archive and wasi-sdk configuration.
- **Missing generated output:** run `pnpm run build` and `pnpm run transpile`
  before `pnpm run demo`, or use `pnpm run all`.
- **File writes:** the tested Perry runtime requests `mutate-directory` when
  opening regular files for writing, which `preview2-shim@0.30.0` rejects with
  `unsupported`. Newer workspace builds support an explicit
  `enableMutateDirectory` option; see the [backend guide][perry-guide]. This
  example uses the published shim and covers reads and metadata.
- **Custom interfaces or Node.js APIs:** Perry supplies its own WASI command
  world and supports a subset of Node-style APIs. Generated guest declarations
  do not add custom-interface support or full Node.js compatibility.

[perry-guide]: ../../../docs/src/perry.md
[contributing]: ../../../docs/src/contributing.md
[perry-tests]: ../../../docs/src/perry.md#testing-and-ci
[p2-shim]: https://www.npmjs.com/package/@bytecodealliance/preview2-shim
[cm-book]: https://component-model.bytecodealliance.org/
