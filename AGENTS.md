# Agent guidelines

## Maintainer-facing prose

- DO NOT leak our conversation, prompt, or iteration history into code comments,
  pull request descriptions, or other maintainer-facing prose.

## Commit messages

- Follow `commitlint.config.mjs`, which extends `@commitlint/config-conventional`.
  Every commit in a PR must pass, including commits retained during a rebase.
- Use `<type>[optional scope]: <subject>`, for example
  `fix(bindgen): preserve WebIDL proxy caching` or `docs(ai): document commit rules`.
- Look up allowed types and scopes in `commitlint.config.mjs` (`type-enum` and
  `scope-enum`). Scope is optional; if used, it must be lowercase.
- Keep commits relatively small in scope and organize them around semantically
  distinct changes. Titles should describe those changes, with a type and scope
  appropriate to the code changed. For example, a bindgen feature or fix might use
  `feat(bindgen): ...` or `fix(bindgen): ...`, while a regression test added in
  `jco-transpile` should have a commit titled `test(transpile): ...`.
- Avoid an excessive number of commits. Semantically distinct changes that belong
  to the same feature can be grouped by squashing related commits. Choose a title
  that describes the combined change and retain the original commit titles in the
  squashed commit's body to preserve the individual changes' descriptions.
- Keep the entire commit title at most 70 characters, without surrounding whitespace.
  Use a nonempty, lowercase-starting imperative subject without a trailing period.
- Separate bodies and footers from preceding text with a blank line. Wrap both
  at 100 characters; body line length is a warning, footer line length is an error.
- Mark breaking changes only with a `BREAKING CHANGE:` footer; do not use `!`
  in the commit title.

## Rust

### Naming

- Never use single-letter aliases, including import aliases such as
  `use something::Component as C;` or `use RuntimeContext as C;`. They obscure
  meaning and make code harder to reason about locally. Use descriptive names
  that are reasonably concise to begin with.

## TypeScript

- Avoid `any` wherever possible. Prefer precise types, or use `unknown` with
  appropriate type narrowing when the type is not yet known.

## JavaScript

- Include JSDoc on most functions and methods where possible to describe their
  purpose, parameters, and return values.
- Use blank lines between logical blocks of code. Add comments explaining the
  functionality of large, dense blocks to make them easier to follow.
