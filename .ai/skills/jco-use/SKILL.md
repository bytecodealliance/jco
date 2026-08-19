---
name: jco-use
description: Use Jco to create, inspect, transform, transpile, bundle, run, or serve WebAssembly Components, generate host or guest TypeScript bindings from WIT, or automate those operations through @bytecodealliance/jco and @bytecodealliance/jco-transpile. Use whenever a task mentions jco, jco-transpile, WIT, Component Model .wasm files, componentize-js, WASI command/HTTP components, preview2/preview3 shims, or importing components through Rolldown/Rollup.
---

# Use Jco

Treat checked-in manifests, installed type declarations, and `jco <command> --help` as the version-specific source of truth. Jco evolves quickly; inspect them before relying on remembered flags.

## Choose the path

- Start a JS/TS guest project from WIT: use `jco scaffold`.
- Turn JS/TS into a component: use `jco componentize`.
- Turn a component into runnable ESM plus core Wasm: use `jco transpile`.
- Import components directly in a bundled app: use `@bytecodealliance/rolldown-plugin-jco`.
- Generate host-side declarations: use `jco types` or `generateHostTypes`.
- Generate declarations for code implemented inside a guest: use `jco guest-types` or `generateGuestTypes`.
- Execute a WASI CLI or HTTP component in Node: use `jco run` or `jco serve`.
- Inspect or transform binaries: use `wit`, `print`, `parse`, `metadata-*`, `embed`, `new`, or `opt`.
- Integrate in code or process in-memory bytes: use `@bytecodealliance/jco-transpile`.

Read [references/cli.md](references/cli.md) before constructing nontrivial CLI commands. Read [references/library.md](references/library.md) before using a package API, custom instantiation, bundling, or WASI shims.

## Set up a modern environment

Prefer a project-local install and `pnpm exec jco`; avoid an unpinned global executable in reproducible work.

```sh
# Use current fnm 1.x. Prefer Node 24 LTS for production; test Node 26 Current when useful.
fnm install 24
fnm use 24

# Use stable pnpm 11 for Node 22+; pnpm 12 is prerelease until its docs say otherwise.
pnpm add -D @bytecodealliance/jco
pnpm exec jco --version
```

Use the repository's lockfile and package-manager choice when one exists. For new bundler work, prefer stable Rolldown 1.x and `@bytecodealliance/rolldown-plugin-jco`; this workspace currently targets Rolldown 1.2.x. Re-check current stable releases before pinning a new project.

In this repository, run `pnpm install`, build the affected package when source changed, and invoke `node packages/jco/dist/jco.js ...` to test the local CLI artifact. Do not silently use a registry copy when validating local changes.

## Work safely and predictably

1. Identify the input as a core Wasm module, a component, WAT, or WIT. Do not pass an Emscripten/`wasm-bindgen` core module to component-only workflows without adapting it.
2. Inspect unfamiliar components with `jco wit`, `jco metadata-show --json`, and, when needed, `jco print`.
3. Name an output path explicitly. Expect transpilation and type generation to produce multiple files; preserve their relative paths.
4. Inspect generated `.d.ts` and the generated entry module before writing host code. WIT imports/exports are named from the guest's perspective.
5. Map imports deliberately. Default transpilation maps supported WASI imports to Jco shims; custom instantiation disables automatic WASI shimming and requires the caller to supply imports.
6. Validate in the target runtime. Node and browsers differ in file loading, top-level await, JSPI, WASI support, and sandboxing.
7. Re-run the smallest relevant command/test and report output files, imports, exports, and experimental options used.

## Avoid common mistakes

- Distinguish JS minification (`--minify`) from core Wasm optimization (`--optimize` or `jco opt`).
- Use `--instantiation=async` when imports must be supplied dynamically; prefer it over sync unless the environment requires sync.
- Use `--tla-compat` only for environments without top-level await and await the generated `$init` before exports.
- Enable `--async-mode=jspi` and async import/export selectors only when the target runtime supports JSPI; treat these and Preview 3 as experimental.
- Remember that `jco run`/`serve` and the default Preview 2 shim expose host capabilities unless explicitly sandboxed. Do not run untrusted components with ambient filesystem, environment, or network access.
- Use `--map 'package:iface/*=./host.js#*'` (quote mappings in shells) for custom host modules; confirm exact generated specifiers rather than guessing.
- Use `--` before raw Binaryen arguments passed through `transpile --optimize` or `opt`.
- Prefer generated types over manually reproducing WIT ABI representations, especially for resources, variants, results, flags, and async interfaces.

## Verify

Run `pnpm exec jco --help` and `pnpm exec jco <command> --help`, then exercise a small known component. For library calls, assert generated file names plus `imports`/`exports`, write with `writeFiles`, and import the generated entry module in the actual target runtime.
