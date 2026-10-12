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

Newer `moon` releases (0.1.20261012 and later) reject the `moon.mod.json` manifests
that `wit-bindgen moonbit` currently generates, so the pin has to move together with
the `wit-bindgen` version once it emits `moon.mod` manifests.
