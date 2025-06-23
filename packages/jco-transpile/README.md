# @bytecodealliance/jco-transpile

This [`@bytecodealliance/jco`][jco] sub-project enables transpilation of [WebAssembly Components][cm-book] into ES modules
that can be run in Javascript environments like NodeJS and the browser (experimental).

`@bytecodealliance/jco-transpile` is used primarily when only transpilation functionality of `jco` is needed,
and `jco` derives it's use of transpilation from this library.

> [!WARNING]
> Browser support is considered experimental, and not currently suitable for production applications.

[cm-book]: https://component-model.bytecodealliance.org/
[jco]: https://www.npmjs.com/package/@bytecodealliance/jco

# License

This project is licensed under the Apache 2.0 license with the LLVM exception.
See [LICENSE](LICENSE) for more details.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this project by you, as defined in the Apache-2.0 license,
shall be licensed as above, without any additional terms or conditions.
