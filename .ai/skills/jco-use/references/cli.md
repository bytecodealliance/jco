# Jco CLI reference

Use this reference to choose a command and its important controls. Always confirm syntax with `jco <command> --help` for the installed version.

## Create components

### `scaffold <project-directory>`

Generate a regular JS/TS project whose skeleton implements a selected WIT world.

- Supply `--wit <file-or-package-dir>` and optionally `--world <world>`.
- Use `--host` to scaffold a host plugin that implements the world's imports.
- Select `--language typescript|javascript`, `--package-manager pnpm|npm|yarn`, and repeat `--target nodejs|web` as needed.
- Prefer TypeScript, pnpm, and only the targets the user needs. Fill in the generated implementation stubs, regenerate types after WIT changes, then run the generated `check`, `test`, and `build` scripts.

### `componentize <source> --wit <path> -o <component.wasm>`

Compile a JS/TS module into a component. This workflow is experimental.

- Select a WIT world with `--world-name` when the package has multiple worlds.
- StarlingMonkey is the default backend; `--backend qjs`/`quickjs` selects componentize-qjs.
- TypeScript is bundled automatically. Use `--bundle` for JavaScript dependencies and `--bundle-config <rolldown.config.mjs>` for project-specific Rolldown settings.
- Use `--enable`/`--disable` for `clocks`, `http`, `random`, `stdio`, `fetch-event`, or `all`.
- Use `--aot` and related Weval/Wizer options only when requested and available.
- Use debug binding/binary options to diagnose componentization, not as normal output.

## Generate JS and types

### `transpile <component.wasm> -o <directory>`

Generate an ESM entry, core Wasm files, and TypeScript declarations.

- Use `--name`, `--base64-cutoff`, `--no-typescript`, `--minify`, and `--optimize` for output shape. Put raw `wasm-opt` flags after `--`.
- Use `--map <specifier=target...>` to supply host mappings and `--no-wasi-shim` to disable automatic Preview 2/3 mappings.
- Use `--instantiation=async|sync` for a callable `instantiate`; otherwise imports instantiate eagerly. Async is the practical default for dynamic host imports.
- Use `--tla-compat` for a generated `$init` promise, `--js` for ASM.js instead of core Wasm, and `--no-nodejs-compat` when Node-specific compatibility is unwanted.
- Use `--import-bindings=js|optimized|hybrid|direct-optimized` only with matching host bindings.
- Use `--async-mode=jspi` with `--async-imports`, `--async-exports`, or WASI-wide selectors for experimental JSPI bindings.
- Use `--stub` with a WIT path to generate a stub implementation.
- Other controls include tracing, error wrapping, namespaced exports, multi-memory, exnref, strict bindings, bigint flags, and valid-lifting optimization.

### `types [wit-path] -o <directory>`

Generate host-side declarations for implementing a component's imports and calling its exports. Select a world with `--world-name`; align instantiation, TLA, async, strict, and flags options with transpilation. Enable WIT feature gates with repeatable `--feature` or `--all-features`.

### `guest-types [wit-path] -o <directory>`

Generate experimental guest-side declarations used while implementing JS component code. Select the world and feature gates explicitly; align async exports, strictness, and bigint flags with componentization.

## Execute components

### `run <command.wasm> [args...]`

Run a WASI Command component in Node. Jco-specific options are prefixed with `--jco-`: retain transpiled output with `--jco-dir`, enable tracing, preload a setup module with `--jco-import`, set mappings with `--jco-map`, or choose import-binding mode. Other arguments pass to the guest.

### `serve <server.wasm> [args...]`

Serve a WASI HTTP component. Set `--host`/`--port`; use the same `--jco-dir`, tracing, preload, mapping, and import-binding controls as `run`. Prefer Wasmtime when peak runtime performance matters; use Jco when JS integration is the goal.

Both commands can expose host filesystem, environment, and network capabilities. Sandbox untrusted guests through custom instantiation and a configured `WASIShim` instead of assuming isolation.

## Inspect and transform

- `wit <component> [-o file] [--document name]`: extract a component's WIT.
- `print <input> [-o file]`: render Wasm binary as WAT.
- `parse <input.wat> [-o file]`: encode WAT as Wasm.
- `metadata-show [wasm] [--json]`: inspect producers and nested module metadata.
- `metadata-add [wasm] --metadata field=name[@version] [-o file]`: add producers metadata.
- `embed [core.wasm] --wit <path> [-o file]`: embed component type metadata; select world, string encoding, dummy mode, and producer metadata as needed.
- `new <core.wasm> [-o component.wasm]`: create a component from a typed core module; apply `[NAME=]adapter` files or built-in `--wasi-command`/`--wasi-reactor` adapters.
- `tool core-to-component ...`: low-level equivalent of the core-to-component conversion workflow.
- `opt <component> -o <output> [--asyncify] -- [wasm-opt args]`: optimize every internal core module with Binaryen; defaults favor size optimization.

## Useful diagnostic sequence

```sh
pnpm exec jco metadata-show --json input.wasm
pnpm exec jco wit input.wasm
pnpm exec jco transpile input.wasm -o out
```

If `wit` fails, verify that the input is a Component Model component. If generated code cannot resolve an import, inspect the transpile summary and generated module specifiers, then add an exact `--map` or provide imports through custom instantiation.
