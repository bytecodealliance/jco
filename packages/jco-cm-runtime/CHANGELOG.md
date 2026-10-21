# Changelog

## [unreleased]

### Breaking changes

- Experimental CM runtime API v2 replaces the root `runtime.create` provider with named `runtime` and `intrinsics/resource` subpaths. `tableGet` takes an explicit trap context. `cmRuntimeEsModule` now identifies a package or directory base; migrate provider files to the documented directory layout and regenerate bindings.
