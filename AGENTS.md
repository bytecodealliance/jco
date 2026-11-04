# Agent guidelines

## Commit messages

- Follow `commitlint.config.mjs`, which extends `@commitlint/config-conventional`.
  Every commit in a PR must pass, including commits retained during a rebase.
- Use `<type>[optional scope][!]: <subject>`, for example
  `fix(bindgen): preserve WebIDL proxy caching` or `docs(ai): document commit rules`.
- Allowed types: `build`, `chore`, `ci`, `debug`, `docs`, `feat`, `fix`, `perf`,
  `refactor`, `release`, `revert`, `style`, `test`, `sec`.
- Scope is optional. If used, choose a lowercase scope from: `deps`, `deps-dev`,
  `examples`, `ci`, `ops`, `docs`, `tests`, `ai`, `jco`, `node-fs`, `bare-jco`,
  `bindgen`, `p2-shim`, `p3-shim`, `transpile`, `rolldown-plugin-jco`, `runtime`, `std`.
- Keep the entire header at most 100 characters, without surrounding whitespace.
  Use a nonempty, lowercase-starting imperative subject without a trailing period.
- Separate bodies and footers from preceding text with a blank line. Wrap both
  at 100 characters; body line length is a warning, footer line length is an error.
- Mark breaking changes with `!` before `:` and/or a `BREAKING CHANGE:` footer.
- Before pushing, fetch the PR's base and validate all PR commits (replace
  `upstream/main` if the PR targets another branch):

  ```sh
  pnpm --filter @bytecodealliance/jco exec commitlint --config ../../commitlint.config.mjs --from upstream/main --to HEAD --verbose
  ```
