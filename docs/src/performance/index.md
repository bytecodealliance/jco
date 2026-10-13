# Performance

Jco aims to make transpiled components run at near-native JavaScript speed, with as little host
overhead as possible between a component's exports and the code that calls them. This section
records how that is measured.

- [Benchmarks](./benchmarks/index.md): reproducible measurements of Jco tooling and runtime paths.

For the host-binding optimizations that affect call performance, see
[Optimized Host Bindings](../advanced/optimized-host-bindings.md).
