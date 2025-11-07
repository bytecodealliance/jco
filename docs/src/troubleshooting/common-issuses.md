# Troubleshooting - Common Issues

## Unsupported ESM URL Scheme

## Symptom

During a `jco serve` or attempting to run the result of a `jco transpile`, you may see an error like the following:

```
$ npx jco serve dist/component.wasm --jco-dir /tmp/jco-serve-output
node:internal/modules/esm/load:183
    throw new ERR_UNSUPPORTED_ESM_URL_SCHEME(parsed, schemes);
          ^

Error [ERR_UNSUPPORTED_ESM_URL_SCHEME]: Only URLs with a scheme in: file, data, and node are supported by the default ESM loader. Received protocol 'wasi:'
    at throwIfUnsupportedURLScheme (node:internal/modules/esm/load:183:11)
    at defaultLoad (node:internal/modules/esm/load:78:3)
    at ModuleLoader.load (node:internal/modules/esm/loader:852:12)
    at ModuleLoader.loadAndTranslate (node:internal/modules/esm/loader:623:31)
    at #createModuleJob (node:internal/modules/esm/loader:654:36)
    at #getJobFromResolveResult (node:internal/modules/esm/loader:354:34)
    at ModuleLoader.getModuleJobForImport (node:internal/modules/esm/loader:319:41) {
  code: 'ERR_UNSUPPORTED_ESM_URL_SCHEME'
}

Node.js v24.8.0
```

### Root cause

The issue here is that somewhere in your transpiled component there is an import that has *not* been mapped
to the appropriate host JS function.

For example, the following snipped of a post-transpile `component.js`:

```js
import { environment, stderr, stdin, stdout, terminalInput, terminalOutput, terminalStderr, terminalStdin, terminalStdout } from '@bytecodealliance/preview2-shim/cli';
import { monotonicClock, wallClock } from '@bytecodealliance/preview2-shim/clocks';
import { preopens, types } from '@bytecodealliance/preview2-shim/filesystem';
import { outgoingHandler, types as types$1 } from '@bytecodealliance/preview2-shim/http';
import { error, poll as poll$1, streams } from '@bytecodealliance/preview2-shim/io';
import { random } from '@bytecodealliance/preview2-shim/random';
import { get, getAll } from 'wasi:config/store';
const { getArguments,
  getEnvironment,
  initialCwd } = environment;
```

The import `from "wasi:config/store"` is problematic because by default NodeJS does not know wwhat to do
with that prefix.

### Solution

There are a few ways to solve this issue, mostly ensuring that the given import is properly satisfied,
*before* NodeJS attempts to run the transpiled JS.

1. (`jco transpile`) Add a `map` parameter when performing the `jco transpile`
   - e.g. `jco transpile --map=wasi:config/store=./path/to/your/module.mjs ...`
2. (`jco serve`) Provide the `--jco-map` option along with a script to set up the environment
   - e.g. `jco serve --jco-map=wasi:config/store=./path/to/your/module.mjs ...`
3. Use an external transpiler/bundler to resolve any `wasi:` or other `<namespace>:<package>/<interface>` imports from the transpiled output JS
