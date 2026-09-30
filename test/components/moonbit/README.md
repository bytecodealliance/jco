# MoonBit extended-test components

MoonBit fixtures use `wit-bindgen moonbit`, `moon` and `wasm-tools`. Each component
directory owns its source, WIT, and build recipe; `component.mbt` takes the place of
the stub that `wit-bindgen` generates. The parent `test/components/justfile` copies
built components into the shared extended-test output directory.

MoonBit strings are UTF-16, so components are embedded with `--encoding utf16`.

Install `moon` from https://www.moonbitlang.com/download/.
