# Local WASI TLS contract

This is a slightly modified copy of [WebAssembly/wasi-tls](https://github.com/WebAssembly/wasi-tls/tree/6781ae26084100c0628ef72cc44e4517c6c48ae5/wit)
at revision `6781ae26084100c0628ef72cc44e4517c6c48ae5`, under the W3C Community
Contributor License Agreement (see LICENSE.md).

It provides a provisional, shared interface for TLS implementations on Node.js,
the web, and other host platforms. It is not an unmodified upstream standard or
a claim that every host platform already has an implementation.

Local changes:

- Use `wasi:io@0.2.12` instead of `0.2.6`, sharing the sockets implementation's
  stream resources directly without version bridging. IO WIT is copied from
  Jco's existing `builtin/0.2.12/wasi-io/package.wit`.
- Add `is-available`, a side-effect-free capability query so denied TLS requests
  fail before acquiring TCP resources.
- Omit upstream unstable-feature annotations so normal WIT tooling can consume
  this explicitly imported local contract without TLS-specific feature handling.

The package retains `wasi:tls@0.2.0-draft`.
Hosts must implement this local contract. The upstream client handshake,
future polling, stream ownership, and output shutdown operations are retained.
Server TLS and guest trust/ALPN configuration remain outside the contract;
certificate verification and trust are host policy. No wit-deps tooling is used.
