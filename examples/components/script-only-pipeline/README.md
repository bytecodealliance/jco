# Script-only JSON pipeline example

This example builds TypeScript [script-only components](../../../docs/src/advanced/script-only-components.md)
with Jco and runs them in **Node.js and the browser using the same pipeline code**. A single QuickJS
engine holds a shared dataset of synthetic access logs. Small `.wasm` components supply the scripts
that filter those logs, calculate risk scores, and count page visits.

The browser starts with an empty pipeline. Download the example components from the page, upload them
to add steps, edit their JSON options, and reorder or remove them to see how the results change.
Uploads are read and transpiled locally in the browser; there is no processing server.
You can also write your own TypeScript processor in the page's editor, build a script-only component,
add it to the pipeline, and download the resulting `.wasm` for either host.

## Quickstart

From this directory in a [built Jco checkout](../../../docs/src/contributing.md#building):

```console
pnpm install
pnpm run all
pnpm run demo:open
```

Use Node.js 24 or newer. This example uses the workspace version of Jco, which includes
`componentize --script-only`. If Puppeteer has no browser installed, run
`pnpm run test:setup:puppeteer` from the repository root before `pnpm run all`.

`pnpm run all` follows the other examples: generate types, check TypeScript, build the components,
transpile the engine and dataset initializer, run the Node.js demo, and run Node.js and Puppeteer tests.
The QuickJS engine uses a synchronous ABI and stubbed WASI because these processors only operate on
in-memory JSON. Neither host needs JSPI flags, filesystem access from the guest, or WASI shims.

## Try the browser demo

Open `http://localhost:5173/demo/` after `pnpm run demo`, or use `pnpm run demo:open`.

1. Run the empty pipeline: all 12 input logs appear unchanged.
2. Download **GeoIP filter**, **Risk score**, and **Most visited pages** using the page's links.
3. Upload the three `.wasm` files in that order. You can also select them directly from `dist/components/`.
4. Run the pipeline. The default GeoIP filter keeps five German logs, the risk step annotates them,
   and the page counter reports `/docs: 2`, `/login: 2`, and `/admin: 1`.
5. Set the risk step's options to `{"minScore":70}` and rerun. Three logs remain, with scores 70, 70, and 90.
6. Move the page counter to the beginning. Its report now counts all 12 input logs, before filtering.

The JSON input is editable. Every run starts from that input, so a previous run's filters, scores, and
reports never leak into the next run. **Restore sample** resets the input; **Clear pipeline** removes
the steps. Invalid uploads or options show an error on the page and can be corrected without a reload.

The IP addresses come from documentation ranges. The US/DE/JP mappings are invented, and the risk
score is an illustrative rule: 20 points for a 4xx response or 40 for a 5xx, 30 for `/admin` or `/login`,
and 20 when the current dataset contains at least three requests from the same IP, capped at 100.

### Create a component in the browser

The **Write your own component** section starts with an editable HTTP status filter. Its
[CodeMirror](https://codemirror.net/examples/basic/) editor highlights TypeScript. Change the code,
give it a name, and choose **Create component & add step**. Run the pipeline to try it, or use
**Download .wasm** to save the generated component. That file can be uploaded again, or copied to
`dist/components/` and selected by name in the Node.js demo.

Custom processors export the same `processor` interface as the checked-in components. Import
`getDataset()` and `parseOptions()` from `pipeline:state`; the browser bundles the existing
`components/shared/state.ts` implementation into your script. `getDataset()` provides mutable `logs`
and `reports`, and `describe()` supplies the step name, description, and default JSON options.
Runtime imports other than `pipeline:state` are not available in this demo.

The browser uses [esbuild's WebAssembly build](https://esbuild.github.io/api/#browser) to bundle
TypeScript into an ES module with a trailing export list, then calls Jco's
`scripts.createComponent()` API from `@bytecodealliance/jco-transpile/component` to package the source.
It reads that Wasm back through the same loader as an upload and validates `describe()` before adding
the step. Code runs inside the shared QuickJS engine. The JavaScript engine is reused as you build
and load new components.

The editor and compiler load from versioned CDN URLs, so browser authoring needs internet access.
Your source stays in the browser; no compilation requests are sent to a server. If the editor CDN is
unavailable, the page keeps a plain source text area. Build errors appear beside the editor and leave
the pipeline intact. Browser builds validate syntax and exports; full TypeScript checking for the
checked-in components and editor template is provided by `pnpm run check`.

## Project layout

```text
components/
  dataset/dataset.ts       Validate/reset input and read snapshots
  geoip/geoip.ts           Annotate synthetic countries and filter
  risk-score/risk-score.ts Score and optionally filter requests
  top-pages/top-pages.ts   Add a page-count report
  shared/state.ts          Shared in-engine data and option parsing
wit/pipeline.wit           Dataset and processor interfaces
generated/types/          Guest declarations generated from WIT
scripts/transpile.mjs      Transpile the engine and dataset initializer
demo/
  shared/pipeline.js       Engine lifecycle and pipeline execution for both hosts
  shared/read-script.js    Runtime .wasm transpilation and script metadata extraction
  node.mjs                Node.js entry point
  browser.js              Uploads, pipeline editing, and results
  custom-component.js     In-browser TypeScript bundling and script-only Wasm creation
  custom-template.ts      Editable, type-checked starting processor
  editor.js               CDN-loaded CodeMirror editor
  access-logs.json         The same sample input for both hosts
  index.html, style.css    Browser interface
  vite.config.js          Local demo server
test/                     Node.js and real browser integration tests
dist/                     Generated component binaries and transpiled bindings (ignored)
```

## Step-by-step

### Generate interface types

```console
pnpm run gen:types
pnpm run check
```

`jco guest-types` generates declarations from [`wit/pipeline.wit`](./wit/pipeline.wit). Each component's
export is checked against its generated interface, for example:

```ts
import type { processor as ProcessorInterface } from 'example:log-pipeline/pipeline';

export const processor: typeof ProcessorInterface = {
    describe() {
        /* name, description, defaultOptions */
    },
    process(options) {
        /* update shared data and return a summary */
    },
};
```

The generated `AccessLog` type also describes the shared records. These declarations are checked in
for editor support and regenerated by `build`; Jco bundles TypeScript directly, so there is no separate
JavaScript compilation step.

### Build the components

```console
pnpm run build:component
```

The command passes all four TypeScript entry points and the WIT world to
`jco componentize --script-only`. It writes:

| Artifact                          | Purpose                                                              |
| --------------------------------- | -------------------------------------------------------------------- |
| `dist/components/engine.wasm`     | One QuickJS runtime implementing the WIT world and script loader     |
| `dist/components/engine.wit`      | The merged engine world, including `jco:script-engine/script-loader` |
| `dist/components/dataset.wasm`    | Script that initializes and snapshots shared data                    |
| `dist/components/geoip.wasm`      | Uploadable location filter                                           |
| `dist/components/risk-score.wasm` | Uploadable request scorer                                            |
| `dist/components/top-pages.wasm`  | Uploadable page counter                                              |

Each script-only component exports `jco:script/script`, which returns bundled source and metadata.
It carries **no JavaScript engine**. The dataset script and processors implement different subsets of
the engine's exports; the host calls only the interface supplied by the currently loaded script.

### Transpile and run

```console
pnpm run transpile
pnpm run run
```

The engine and dataset initializer are transpiled ahead of time with `--instantiation async`.
Processing components remain `.wasm` files until the host loads them. The shared
[`readScript`](./demo/shared/read-script.js) helper uses `@bytecodealliance/jco/component` to transpile
those files, instantiates their generated bindings, and reads `script.name()`, `script.source()`,
`script.exports()`, and `script.engineWorld()`.

The shared [`createPipeline`](./demo/shared/pipeline.js) runner instantiates the engine once. Its only
platform adapter is a function that reads bytes from a URL: Node.js supplies `readFile`, and the browser
supplies `fetch`. Both entry points use the same script reader and execution code.

For each run, the runner loads the dataset script and calls `dataset.reset(input)`. For each step, it
loads that step's source with `scriptLoader.load`, calls `processor.process(options)`, then reloads the
dataset script to read a snapshot. Loading scripts replaces the active exports, but retains the
engine's JavaScript realm. The working dataset lives on that realm's `globalThis`, shared through
[`components/shared/state.ts`](./components/shared/state.ts); it is not passed back and forth between
processors as JSON. Only input, options, summaries, and output snapshots cross the host boundary.

> [!NOTE]
> Scripts in one engine share a realm and can access each other's data. Use trusted scripts together;
> use a separate engine instance for a separate trust boundary. An upload's metadata checks are for
> compatibility, not a security sandbox. The engine world is fixed at build time: new scripts must
> implement this example's processor interface and shared dataset convention.

The Node.js demo prints:

```text
GeoIP: 12 → 5 logs (DE)
Risk: scored logs and kept 5 with score ≥ 0
Pages: counted 5 logs across 3 paths
```

The final JSON follows those summaries. The browser shows the same summaries and JSON.

Choose the Node.js stages and their execution order with positional arguments or the comma-separated
`PIPELINE_STAGES` environment variable:

```console
pnpm run run top-pages geoip
PIPELINE_STAGES=geoip,top-pages pnpm run run
PIPELINE_STAGES= pnpm run run
```

Arguments take precedence over the environment variable. With neither specified, the demo runs
`geoip`, `risk-score`, then `top-pages`. An empty environment value runs an empty pipeline. Stage names
are the filenames in `dist/components/` without `.wasm`; unknown names report the available stages and
exit with a nonzero status. Each selected stage uses its own default options.

The entry point exports an async `main()` and calls it only when executed directly, so importing
`demo/node.mjs` does not run the demo.

### Add a processor

Create another folder under `components/`, export a `processor` checked against the generated interface,
and use `getDataset()` from `components/shared/state.ts` to read or modify the shared logs and reports.
Give its entry point a unique filename and add it to `build:component`. Rebuild, then upload the new
`.wasm` file: the browser discovers its name, description, and default options through `describe()`.
The pipeline runner needs no changes for another processor following this contract.

### Test

```console
pnpm run test:node
pnpm run test:browser
```

The tests exercise the built Wasm components, shared data across script loads, ordering and options,
repeat runs, empty input, invalid uploads, and recovery from errors. Node.js tests also cover CLI and
environment stage selection, precedence, unknown names, and the direct-execution guard. The Puppeteer
test uploads actual `.wasm` files, edits the highlighted TypeScript editor, builds custom components,
loads the downloadable bytes in Node.js, uploads them again, and checks recovery from syntax errors.
The browser test needs access to the editor and compiler CDNs. Like the other browser examples, it supports `PUPPETEER_PATH` and
`TEST_PUPPETEER_LAUNCH_ARGS` for local browser configuration.
