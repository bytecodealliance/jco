## Example Components

Most (if not all) individual example projects are standard Javascript projects commonplace ecosystem tooling, whether
for server side ([NodeJS][nodejs] -- `npm`, etc) or the browser.

A brief description of the examples contained in this folder:

| Example                                                    | Component Description                                                                            |
|------------------------------------------------------------|--------------------------------------------------------------------------------------------------|
| [`add`](./add)                                             | `export`s basic functionality with simple types                                                  |
| [`http-hello-world`](./http-hello-world)                   | HTTP server using the [`wasi:http/incoming-handler`][wasi-http], the hard way.                   |
| [`http-server-fetch-handler`](./http-server-fetch-handler) | HTTP server using standards-forward `fetch()` event handling built into [StarlingMonkey][sm]     |
| [`http-server-hono`](./http-server-hono)                   | HTTP server using the standards-forward [Hono][hono] framework                                   |
| [`node-fetch`](./node-fetch)                               | Performs a HTTP request using `fetch()`                                                          |
| [`string-reverse-upper`](./string-reverse-upper)           | `import`s functionality to build more advanced computation to `export`                           |
| [`string-reverse`](./string-reverse)                       | `export`s basic functionality with a slightly more involved WIT interface and more complex types |
| [`webidl-book-library`](./webidl-book-library)             | Showcases [WebIDL][webidl] support using [`webidl2wit`][webidl2wit]                              |

[nodejs]: https://nodejs.org
[sm]: https://github.com/bytecodealliance/StarlingMonkey
[wasi-http]: https://github.com/WebAssembly/wasi-http
[webidl]: https://developer.mozilla.org/en-US/docs/Glossary/WebIDL
[webidl2wit]: https://github.com/wasi-gfx/webidl2wit
[hono]: https://hono.dev
