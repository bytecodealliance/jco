# Bundled WASI WIT snapshots

These WIT sources are derived from the official
[`WebAssembly/WASI`](https://github.com/WebAssembly/WASI) repository:

- `0.3.0`: tag `v0.3.0`, commit `3ee2a590c766594ae44a54730fc74fc27da5c609`
- `0.2.12`: tag `v0.2.12`, commit `281ba75fafcd50961ef55f9e52747afcc9b71ede`

Each proposal package's `.wit` files are combined into one `package.wit`.
Documentation comments, blank lines, and release-history annotations are
removed to reduce the published package size; WIT declarations are unchanged.
The snapshots remain covered by the official WASI license in `LICENSE.md`.
