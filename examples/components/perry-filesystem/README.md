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

| Path                     | Purpose                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `src/guest/component.ts` | TypeScript guest source compiled by Perry.                                                |
| `scripts/`               | Local toolchain installation, type generation, component build, and Node.js demo scripts. |
| `data/input.txt`         | Sample host file exposed to the guest as `/data/input.txt`.                               |
| `wit/`                   | Generated copy of Jco's bundled WASI P2 command world.                                    |
| `generated/types/`       | Generated guest declarations for that reference world.                                    |
| `dist/component.wasm`    | Compiled component.                                                                       |
| `dist/transpiled/`       | JavaScript and core Wasm produced by Jco.                                                 |

`wit/`, `generated/`, `dist/`, and `.perry-toolchain/` are generated and ignored by Git.
For background on components and WASI, see the [Component Model Book][cm-book].

## Prerequisites

Complete the repository's [normal build/setup][contributing] first.

The local installer, [`scripts/install-perry.mjs`](./scripts/install-perry.mjs),
targets Linux (glibc), macOS, and Windows on x86_64 and ARM64.
Use Node.js 24+, pnpm 11, Git, `curl`, CMake 3.20+, Ninja, Python 3.10+, and
Rust installed through `rustup`. A native C/C++ compiler and the platform SDK
must already be available:

- **Linux:** GCC/G++ or Clang and the system C/C++ headers and linker.
- **macOS:** Xcode Command Line Tools, including the macOS SDK.
- **Windows:** an MSVC Rust host and Visual Studio C++ Build Tools with the Windows
  SDK. Run the commands in a Developer PowerShell configured for your host
  architecture so that `cl.exe` and the linker are on `PATH`. Install Git for
  Windows and Python with their command-line tools on `PATH`.

These are development prerequisites; the installer does not invoke `sudo`, request
administrator access, modify package repositories, or install system packages.
LLVM itself is built into the example directory, so LLVM development packages from
apt, Homebrew, or Chocolatey are not required. CMake and Ninja can also be installed
in a user-owned Python environment if they are not already available.

You need a **WASI-enabled Perry compiler**, its matching runtime archive, and
wasi-sdk. The published `@perryts/perry@0.5.1520` package predates the WASI target.
The local installer builds the compiler and runtime from source at a pinned Git
commit; `pnpm install` alone does not install them.

## Quickstart

After completing the repository build/setup, run from the repository root.
These commands work in a POSIX shell or Windows Developer PowerShell:

```sh
pnpm install --frozen-lockfile
pnpm run build
cd examples/components/perry-filesystem
pnpm run setup:perry
pnpm run all
```

The example-local [installer](./scripts/install-perry.mjs):

1. Downloads and verifies the LLVM 22.1.8 source archive, then builds its
   development headers and libraries with the X86, AArch64, and WebAssembly
   backends. On Windows it also builds the `LLVM-C.dll`/`LLVM-C.lib` pair that
   Perry requires.
2. Downloads and verifies the wasi-sdk 34 archive for the current OS and CPU.
3. Installs the host-specific Rust `nightly-2026-10-08` toolchain and its `wasm32-wasip2` target through
   `rustup`, without changing the default Rust toolchain.
4. Fetches Perry commit `3945beb23ebeca54846a30d89cb4971de59b0c6c` and builds
   the WASI-enabled compiler and runtime from that same checkout, using its
   Cargo lockfile and portable runtime build script.
5. Links a small WASI component to check the complete toolchain before recording
   the successful installation.

Downloads, sources, build caches, and installed tools stay in this example's
ignored `.perry-toolchain/` directory. Rust toolchains and Cargo dependencies
also use rustup's and Cargo's normal user-owned caches. The installer does not
use the repository's Linux-only CI provisioning script.

**The first LLVM source build is substantial:** allow several gigabytes of memory,
tens of gigabytes of free disk space, and potentially hours on a slower machine.
The default is at most two parallel jobs to limit memory use. To adjust it:

```sh
pnpm run setup:perry --jobs 4
```

Build files are retained after a failure; rerun the same command to resume.
Downloaded archives are checked again before reuse. If you already have LLVM 22
with development headers, static libraries on Linux/macOS, and the three target
backends, you can skip the LLVM source build:

```sh
pnpm run setup:perry --llvm-prefix /path/to/llvm-22
```

On Windows, quote paths containing spaces and use a development installation
containing `bin/LLVM-C.dll` and `lib/LLVM-C.lib`; the installer checks these files.
A Clang-only installation or wasi-sdk alone is insufficient.

The example automatically reads `.perry-toolchain/install.json` when building.
It selects the local compiler, runtime and SDK and supplies the LLVM DLL search
path on Windows. No shell-specific `export` or `$env:` commands are needed.
In a new shell, return to this example directory and run `pnpm run all`; there
is no need to rebuild Perry for each run.

### Updating the pinned version

The manually maintained pins live in [`scripts/perry-toolchain.json`](./scripts/perry-toolchain.json).
Change `perryRef` to a full, tested Git commit SHA, then rerun `pnpm run setup:perry`.
Both the compiler and runtime are built from this ref; the script never follows
`main` or a moving latest release. Update the Rust/LLVM/SDK pins and SHA-256 values
in that file as needed when adopting a new Perry revision. A stale local install
is rejected until it has been rebuilt with the new pins.

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

If a WASI-enabled `@perryts/perry` package is installed in this project and there
is no example-local toolchain, leave `JCO_PERRY_CLI_PATH` unset and run `pnpm run all`. The environment variable is
a convenience provided by this example's build script; the Jco CLI's direct
selection option is `--backend-perry-cli-path`.

## Step-by-step

### Install dependencies and select the compiler

From this example directory, install the Preview 2 shim:

```console
pnpm install
```

If you followed the quickstart, the example selects the local toolchain
automatically. To use a project-installed compiler instead, install your chosen
WASI-enabled package explicitly, for example
`pnpm add --save-dev /path/to/perry-cli-package`.
Its manifest must expose a `perry` executable as described in the
[backend guide][perry-guide]. A source-built executable can instead be selected
by path in the build step below. Explicit compiler options and
`JCO_PERRY_CLI_PATH` take precedence over the example-local installation.

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

With the local toolchain installed, compile the component:

```console
pnpm run build:component
```

Alternatively, pass an explicit executable with
`pnpm run build:component --backend-perry-cli-path /absolute/path/to/perry`, or
select a project-installed `@perryts/perry` with
`pnpm run build:component --backend-perry-package @perryts/perry`.
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
pnpm exec jco wit dist/component.wasm
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

## Potential Issues

- **Installer cannot find a command:** check the prerequisites above and ensure
  their executables are on `PATH`. On Windows, use Developer PowerShell with
  the C++ build environment configured for the host architecture.
- **Source build runs out of memory:** rerun `pnpm run setup:perry --jobs 1`;
  the build cache is retained. Ensure there is enough disk space as well.
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
[perry-tests]: ../../../packages/jco/test/perry/e2e.js
[p2-shim]: https://www.npmjs.com/package/@bytecodealliance/preview2-shim
[cm-book]: https://component-model.bytecodealliance.org/
