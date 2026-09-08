# ComponentizeJS 0.22.0: missing WebAssembly and incorrect AbortSignal.any reason

Recorded 2026-09-08 while investigating Jco PR #2080.

## Status and impact

The integration test `provides the supported Node globals to a StarlingMonkey guest` in `packages/jco/test/node/globals.js` is temporarily skipped at the user's request. A `TODO(fix)` immediately above it summarizes the two observed problems. Its body and assertions are preserved.

This one test exposes two distinct issues in the StarlingMonkey engine embedded by `@bytecodealliance/componentize-js@0.22.0`:

1. `globalThis.WebAssembly` is absent. The test expects the guest to compile/instantiate a small Wasm module.
2. `AbortSignal.any()` marks the combined signal aborted but does not preserve the originating signal's reason.

Both reproduce in a plain JavaScript component without Jco's Node builtin bundling or jco-std imports. This isolates them from the Node globals shim. Absence of WebAssembly is a support gap; the abort reason behavior is a correctness failure. They need not have the same underlying cause.

The CI failure originally stopped earlier: the test used the default `component.js`/`wit` paths, while the fixture actually contains `source.js`/`source.wit`. Commit `81c80538` fixes those paths. It does not fix these runtime behaviors.

## Minimal reproduction

WIT:

```wit
package repro:globals;

world test {
    export run: func() -> string;
}
```

Guest source:

```js
export function run() {
    const controller = new AbortController();
    const combined = AbortSignal.any([controller.signal]);
    controller.abort('stopped');

    return JSON.stringify({
        webAssembly: typeof WebAssembly,
        directReason: controller.signal.reason,
        combinedReason: combined.reason,
    });
}
```

Expected when both APIs meet the test's requirements:

```json
{
    "webAssembly": "object",
    "directReason": "stopped",
    "combinedReason": "stopped"
}
```

Observed in the component on Linux arm64, hosted by Node 26.8.1:

```json
{
    "webAssembly": "undefined",
    "directReason": "stopped",
    "combinedReason": 5e-324
}
```

The numeric value is an observation from these runs, not an expected stable symptom or a regression assertion to bake into a fix. The meaningful contract is preservation of the original reason, including its value and identity where applicable.

Run the checked-in reproduction helper from the repository root with dependencies installed:

```sh
# This checkout has a suitable Node and tools configured here:
source .llm/env.sh
node .llms/notes/reproduce-componentize-issues.mjs globals
```

The helper resolves this checkout's ComponentizeJS/transpiler/shim dependencies, writes a fresh source and WIT file to a temporary directory, componentizes the source without bundling, transpiles it for explicit instantiation, and invokes `run`. It prints the artifact directory and the JSON result. On another checkout, use an equivalent Node 26 environment instead of sourcing the local environment file.

## WebAssembly support gap

The integration fixture uses guest-side Wasm execution. The following illustrates the requirement with a minimal valid empty module:

```js
const bytes = new Uint8Array([
    0x00,
    0x61,
    0x73,
    0x6d, // magic
    0x01,
    0x00,
    0x00,
    0x00, // version
]);
const module = new WebAssembly.Module(bytes);
const instance = new WebAssembly.Instance(module);
```

The current engine cannot reach module validation: resolving `WebAssembly` already fails. The fact that the outer Node host has a WebAssembly implementation does not provide one inside the embedded guest engine.

A fix requires establishing whether this StarlingMonkey build can support nested Wasm execution and, if so, enabling/exposing that implementation. If the engine deliberately excludes it, the project needs an explicit supported-API decision. Adding an empty global or weakening the assertion would not implement the behavior under test. No engine build configuration change has been attempted.

## AbortSignal.any correctness failure

The simplest required invariant is:

```js
const reason = { kind: 'cancelled' };
const controller = new AbortController();
const combined = AbortSignal.any([controller.signal]);
controller.abort(reason);

console.assert(controller.signal.aborted);
console.assert(combined.aborted);
console.assert(controller.signal.reason === reason);
console.assert(combined.reason === reason);
```

The detailed earlier fixture diagnostic observed both signals as aborted, with direct reason `"stopped"`, combined reason `5e-324`, and an empty reported abort error message. This narrows the problem to reason propagation/exposure rather than failure to notice cancellation.

The internal engine cause has not been traced. A representation, rooting, or lifetime problem is only a hypothesis; the small floating-point value is not proof of one. Useful upstream regression cases would cover aborting after `any` creation, an already-aborted input, object and string reasons, and the default reason when `abort()` receives no argument.

## Evidence and completion criteria

- Original linked CI job: https://github.com/bytecodealliance/jco/actions/runs/34196599548/job/101966235297?pr=2080
- Original standalone artifacts: `.llm/tmp/globals-engine-repro/`.
- Earlier full fixture diagnostic: `.llm/notes/ci-globals-abort.log`.
- Fresh reproduction output: `.llm/notes/callback-globals-control.log`.
- Reproduction helper: [reproduce-componentize-issues.mjs](reproduce-componentize-issues.mjs).

Remove the skip when the full original globals integration test passes against the chosen engine/dependency configuration. Verify actual guest Wasm execution and correct abort reason propagation; merely making the initial fixture path error disappear is insufficient.
