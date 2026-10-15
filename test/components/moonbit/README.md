# MoonBit extended-test components

MoonBit fixtures use `wit-bindgen moonbit`, `moon` and `wasm-tools`. Each component
directory owns its source, WIT, and build recipe; `component.mbt` takes the place of
the stub that `wit-bindgen` generates. The parent `test/components/justfile` copies
built components into the shared extended-test output directory.

MoonBit strings are UTF-16, so components are embedded with `--encoding utf16`.

Install `moon` from https://www.moonbitlang.com/download/. CI pins the toolchain to
the version in the `Install MoonBit` step of `.github/workflows/main.yml`; install the
same one locally with:

```console
curl -fsSL https://cli.moonbitlang.com/install/unix.sh | bash -s 0.10.14+7d59c7ec9
```

CI installs a separate `wit-bindgen-cli` 0.63.0 for MoonBit and selects it with
`MOONBIT_WIT_BINDGEN`. Other languages use the latest CLI. To use the same MoonBit
generator locally, install it separately and set the path:

```console
cargo install wit-bindgen-cli --version 0.63.0 --locked --no-default-features --features moonbit --root /tmp/moonbit-wit-bindgen
export MOONBIT_WIT_BINDGEN=/tmp/moonbit-wit-bindgen/bin/wit-bindgen
```

MoonBit recipes fall back to `WIT_BINDGEN`, then `wit-bindgen` on `PATH`, when
`MOONBIT_WIT_BINDGEN` is unset.

The pinned generator emits `moon.mod` and `moon.pkg` manifests. The issue-2178
caller supplies a `moon.pkg` with its `greet` import in place of the generated
package manifest. A `moon.pkg.json` override is ignored when the generated
`moon.pkg` is present. Update the MoonBit toolchain pins and fixture manifests
together.
