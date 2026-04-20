# Common issues

## componentize-js 0.19.3 fallback

### Symptom

While running `jco componentize`, you may see a warning like this:

```text
warning Falling back to componentize-js 0.19.3 because this component requests Preview 2 WASI packages older than 0.2.10.
```

If that component is then run on newer Wasmtime releases, especially Wasmtime 42 or newer, you may hit the same isolate crash that was fixed upstream in `componentize-js` 0.20.0.

### Root cause

`jco` normally uses `componentize-js` 0.20.0 or newer, which includes the upstream fix for [ComponentizeJS issue #224](https://github.com/bytecodealliance/ComponentizeJS/issues/224).

When the component's WIT still depends on Preview 2 WASI packages older than `0.2.10`, `jco` must fall back to `componentize-js` `0.19.3` for compatibility. In practice this usually shows up as `wasi:http` older than `0.2.10`, but related dependencies such as `wasi:clocks`, `wasi:random`, and `wasi:io` can force the same fallback. The older `componentize-js` version does not include the upstream fix, so the crash can reappear.

For background, see [jco issue #1415](https://github.com/bytecodealliance/jco/issues/1415).

### Solution

Update `wasi:http` and any related Preview 2 WASI dependencies to `0.2.10` or newer, then re-run `jco componentize`.

If you manage your WIT dependencies with [`wkg`](https://github.com/bytecodealliance/wasm-pkg-tools), fetching the updated packages can look like this:

```bash
wkg get --format wit wasi:http@0.2.10
wkg get --format wit wasi:clocks@0.2.10
wkg get --format wit wasi:random@0.2.10
wkg get --format wit wasi:io@0.2.10
```

After updating the packages, make sure your entry WIT file and any vendored dependency files reference the newer versions before componentizing again.
