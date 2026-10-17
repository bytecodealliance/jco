# Perry backend

`jco componentize --backend perry` compiles JavaScript or TypeScript with a
[Perry](https://github.com/PerryTS/perry) CLI selected by path or installed in the
project. Perry compiles the
original module graph to a WASI Preview 2 command component. Jco does not bundle
the source, erase its TypeScript types, or inject its Node compatibility adapters.
Supported imports such as `node:fs` use Perry's WASI implementation.

This backend is experimental. Perry does not yet generate bindings for custom WIT
interfaces. It owns the component's world and exports `wasi:cli/run@0.2.x`; your
program runs from its top-level entry module. Omit `--wit` and `--world-name` when
componentizing with Perry. Those options, Jco bundling/Node adapter options, and
options specific to StarlingMonkey or QuickJS are rejected.

## Install and select a compiler

Perry is **not a dependency of Jco**. To use an unreleased WASI-enabled source
build directly, supply its executable path; no npm wrapper is needed:

```sh
jco componentize src/main.ts --backend perry \
  --backend-perry-cli-path /path/to/perry/target/debug/perry -o component.wasm
```

The path can also name a `.js`, `.cjs`, or `.mjs` launcher. Relative CLI paths
are resolved from the directory where you invoke Jco, independently of `--cwd`.
The explicit path bypasses npm resolution. `--backend-perry-cli-path` and
`--backend-perry-package` cannot be used together.

For a project-installed compiler, install your chosen WASI-enabled version and
commit your package manager's lockfile:

```sh
npm install --save-dev @perryts/perry@<version>
jco componentize src/main.ts --backend perry -o component.wasm
```

**The compiler must support `perry compile --target wasi`.** The published
`@perryts/perry@0.5.1520` release predates that support. Installing it alone does
not provide a working WASI toolchain. Follow Perry's
[standalone WASI build instructions](https://github.com/PerryTS/perry/blob/main/docs/WASI_SUPPORT.md)
for a compiler built with the `target-wasi` Cargo feature, the matching WASI
runtime archive, and wasi-sdk. The upstream configuration uses LLVM 22 and
wasi-sdk 34. Configure `WASI_SDK_PATH` and, for an out-of-tree runtime,
`PERRY_RUNTIME_DIR` as described upstream; Jco inherits the compiler environment.
The browser-oriented `--target wasm` is a different target.

The filesystem workflow below was validated on Linux with Perry source commit
[`3945beb23e`](https://github.com/PerryTS/perry/commit/3945beb23ebeca54846a30d89cb4971de59b0c6c)
(CLI version `0.5.1659`), its matching WASI runtime, LLVM 22.1.8, wasi-sdk 34,
Rust `nightly-2026-10-08`, and Node 24.21.0. Use the
[WASI instructions at that commit](https://github.com/PerryTS/perry/blob/3945beb23ebeca54846a30d89cb4971de59b0c6c/docs/WASI_SUPPORT.md)
when reproducing the source build; pin both compiler and runtime to the same
revision. Version `0.5.1659` alone does not identify this source snapshot.

Without an explicit CLI path, Jco resolves `@perryts/perry/package.json` starting at the entry module's directory,
then invokes the package's `bin.perry` entry. Normal Node package resolution finds
the nearest enclosing project's installation, including workspace symlinks. It
does not search the global executable `PATH`. `--cwd <directory>` selects a
different compiler project and child-process working directory. Source and output
paths remain relative to the directory where you invoke Jco.

To select an npm alias or a locally packaged WASI compiler, use
`--backend-perry-package`:

```sh
npm install --save-dev my-perry@npm:@perryts/perry@<version>
jco componentize src/main.ts --backend perry --backend-perry-package my-perry -o component.wasm
```

A local package must expose its `package.json` and declare `"bin": { "perry":
"path/to/cli" }` (a string `bin` is also accepted). The entry can be a native
executable or a `.js`, `.cjs`, or `.mjs` launcher.
There is currently no importable Perry compiler API; Jco keeps the backend name
independent of that implementation detail.

Before compiling your source, Jco checks WASI code generation by compiling a tiny
isolated module with `--target wasi --no-link` and verifying that it produces a
Wasm object. This detects compilers that silently fall back to a native target;
Perry's help/version strings do not reliably identify WASI-enabled builds. Failed
checks include the selected CLI path, compiler diagnostics and setup guidance.
The check has a 30-second timeout and does not link the WASI runtime. The actual
build still needs the matching runtime and SDK, and its output is validated as a
WASI P2 command before Jco writes the destination file.

## Generate declarations, compile, and run on Node.js

Use a WASI P2 command WIT package to generate declarations. A convenient source
is Jco's bundled snapshot, copied by the scaffold command:

```sh
jco scaffold perry-app --wit builtin:wasi-command@0.2.x --target nodejs
cd perry-app
# Install Jco; select your compiler by explicit path below or install its package.
npm install @bytecodealliance/preview2-shim
jco guest-types wit --world-name wasi:cli/command@0.2.12 -o types
```

`guest-types` generates `.d.ts` declarations, not Perry runtime bindings. They
describe the WASI interfaces for reference and type checking; they do not make
`import "wasi:filesystem/types"` or custom guest exports compile in Perry. The
compiler and its SDK determine the exact WASI patch versions in the output;
inspect them with `jco wit component.wasm`. Use a top-level Perry program in place
of the scaffold's generated guest implementation and build scripts.

For example, save this as `source.ts`:

```ts
import { readFileSync, statSync } from "node:fs";

const input: string = readFileSync("/data/input.txt", "utf8");
console.log(`Perry size: ${statSync("/data/input.txt").size}`);
console.log(`Perry read: ${input}`);
```

Build the component, then transpile it with the ordinary synchronous WASI
bindings:

```sh
jco componentize source.ts --backend perry \
  --backend-perry-cli-path /path/to/perry -o component.wasm
jco transpile component.wasm --bindgen-enable-wasm-exnref -o transpiled
mkdir -p data
printf 'hello from the filesystem\n' > data/input.txt
```

In an ESM project (`"type": "module"` in `package.json`), save `run.mjs`:

```js
import { resolve } from "node:path";
import { filesystem } from "@bytecodealliance/preview2-shim";

filesystem._setPreopens({ "/data": resolve("data") });
const { run } = await import("./transpiled/component.js");
run.run();
```

Run `node run.mjs`. The program reads the contents and size of a file inside the
preopened `data/` directory. This flow uses the Preview 2 shim and does not require
JSPI or Node's experimental WASI API. Perry's WASI runtime uses WebAssembly exception handling,
so enable it in Jco with `--bindgen-enable-wasm-exnref` and use a Node version that
supports the instructions emitted by your compiler. This is a transpiler option,
not an experimental Node flag.

File writes have a known compatibility limitation with `preview2-shim@0.30.0`:
the tested Perry runtime requests the WASI `mutate-directory` descriptor flag
when opening a regular file for writing, which the shim rejects as `unsupported`.
The workspace shim supports an explicit compatibility option for this behavior
(not available in `0.30.0`). With a build containing that support, configure the
host before importing the transpiled component:

```js
filesystem._setPreopens({ "/data": resolve("data") }, { enableMutateDirectory: true });
```

This gives the preopened directory mutation capability and preserves capability
checks on its descendants. The flag is accepted and cleared on regular files;
file writes still require write permission. See the
[shim's directory mutation options](https://github.com/bytecodealliance/jco/tree/main/packages/preview2-shim#directory-mutation-compatibility-nodejs)
for details. The example exercises reading and metadata and remains usable with
`0.30.0`; the tests below also cover mutations with the workspace shim.

The repository contains a [filesystem example](https://github.com/bytecodealliance/jco/tree/main/examples/components/perry-filesystem)
with build scripts and a Node.js demo.

## Testing and CI

Perry tests use the regular Jco Vitest configuration. After the normal checkout
setup, build the workspace shim and run the adapter tests and real-compiler
filesystem tests from the repository root:

```sh
pnpm --filter @bytecodealliance/preview2-shim build
TEST_PERRY_BIN=/absolute/path/to/perry \
  pnpm --filter @bytecodealliance/jco test perry
```

Set `WASI_SDK_PATH` and `PERRY_RUNTIME_DIR` for that compiler as described above.
The real-compiler tests skip when `TEST_PERRY_BIN` is unset or the file is absent.
A present compiler must pass Jco's WASI capability check and complete the build;
unsupported compilers and missing runtime/SDK files fail the tests.

The adapter tests always run, using isolated CLI test doubles to cover resolution,
option validation, diagnostics, and output preservation. The real-compiler tests
exercise both explicit CLI selection and a project-local package containing the
selected binary. Each generates declarations, compiles a TypeScript guest,
transpiles it, and runs it in ordinary Node without experimental flags. They use
isolated projects linked to the built workspace shim. Creating and changing input
after compilation verifies host filesystem access at runtime.

The read/stat cases use the filesystem example. Mutation cases additionally
exercise file creation, overwrite/truncation, append, UTF-8 byte sizes, directory
listing, rename, unlink, mkdir and rmdir. The same compiled mutation guest first
runs with default shim settings, which must reject the write without changing the
host files, then succeeds with `enableMutateDirectory: true`. The tests verify
actual host contents and directory entries, as well as guest output.

The normal CI workflow's `examples-perry` job runs the example's `all` script and
these tests on Ubuntu 24.04 / Node 24, restoring the workspace shim build for the
E2Es. The
[pinned build recipe](https://github.com/bytecodealliance/jco/blob/main/scripts/ci/build-perry-wasi.sh)
builds the unreleased WASI compiler and its matching runtime, verifies the SDK
checksum, and caches the finished compiler, runtime archive, and SDK. The cache
key includes the runner architecture and recipe contents. Cache hits skip the
source build; CI supplies `TEST_PERRY_BIN` and verifies the executable before
running tests.

## Version ownership and dependency choices

| Approach | Installation and upgrades | Maintenance tradeoff |
| --- | --- | --- |
| Project-installed package (used here) | Users install and pin the compiler; Jco does not upgrade it. | Jco maintains a narrow CLI adapter and validates the resulting component. Users need explicit setup and compatibility guidance. |
| Regular dependency | Installed automatically; Jco chooses the supported range. | Easiest initial setup, but compiler size and version changes affect every Jco installation. A compiler upgrade can change generated behavior even when Jco's own API stays stable. |
| Optional dependency | Normally installed automatically, but installation failure is tolerated. | Still couples the default compiler version to Jco; absence must be handled at runtime. It is not an opt-in install mechanism. |
| Required peer dependency | Advertises a compatible range; npm can install missing peers. | Makes compatibility visible, but incompatible ranges can cause installation conflicts and require coordinated Jco updates. |
| Optional peer dependency | Advertises compatibility without requiring installation. | A reasonable future choice once Perry's contract stabilizes; the declared version range still needs maintenance. |

Project-local loading avoids forcing a compiler upgrade through a Jco dependency
update. It does not guarantee compatibility with every Perry version: CLI
changes, language changes, and WASI runtime changes still require testing. Keep a
known-working compiler/toolchain combination pinned. Jco preserves compiler
diagnostics and rejects output that is not a decodable WASI P2 command component.

See [npm's dependency documentation](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#peerdependencies)
for peer, optional-peer, and optional-dependency installation behavior.
