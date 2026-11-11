# Security policy

## Reporting a vulnerability

Do not report vulnerabilities in public issues, pull requests, or chat.

Jco follows the [Bytecode Alliance security policy][ba-security]. Report privately through
[GitHub private vulnerability reporting][gh-report], or by email to
<security@bytecodealliance.org>. Include reproduction steps, the affected packages and versions,
the platform (Node.js or browser, with version), and the impact.

If you are unsure whether a bug is a vulnerability, or whether it belongs to Jco or to a platform
Jco runs on, report it privately and the maintainers will route it.

## Scope

This policy covers every package published from this repository: `@bytecodealliance/jco`,
`jco-transpile`, `jco-cm-runtime`, `preview2-shim`, `preview3-shim`, `jco-node-fs`, `jco-std`,
`rolldown-plugin-jco`, and the `js-component-bindgen` crate.

- [Security model][model]: what Jco protects against on Node.js and in browsers, what it leaves
  to the embedder, and what it depends on.
- [What is considered a security vulnerability?][vuln]: which bugs qualify, with a cheat sheet.

Jco runs on JavaScript engines, Node.js, and browsers that it does not control. Vulnerabilities
in those projects are reported to them, not to Jco.

[ba-security]: https://bytecodealliance.org/security
[gh-report]: https://github.com/bytecodealliance/jco/security/advisories/new
[model]: https://bytecodealliance.github.io/jco/security/index.html
[vuln]: https://bytecodealliance.github.io/jco/security/what-is-a-vulnerability.html
