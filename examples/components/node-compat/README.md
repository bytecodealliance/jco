# NodeJS compat example (via `unenv`)

JS WebAssembly components are built with [StarlingMonkey][sm] which is more aligned with the
[WinterTC][wintertc] specification and Web platform primitives, so by default NodeJS platform
primitives are not included by default.

This repository showcases using a WebAssembly component built with the Javascript WebAssembly Component
toolchain (`jco`) that uses NodeJS imports shimmed by combining [`unenv`][unenv] and [rolldown][rolldown].

[unenv]: https://github.com/unjs/unenv
[rolldown]: https://rolldown.rs

## How it works

The source code in [`src/component.js`](./src/component.js) uses NodeJS imports like [`Buffer`][nodejs-docs-buffer]
and [`URL`][nodejs-docs-url] which are normally *not* available to JS ecosystem components (for now).

The source code is transpiled with `rolldown` into a `dist/component.js` (with imports filled)
which is then compiled to WebAssembly via `jco componentize`.

To *use* our component from *actual* NodeJS environments, we can use `jco transpile` to run the
component. This serves as a "virtual" WebAssembly + [WASI][wasi] host (see [`@bytecodealliance/preview2-shim`][p2-shims])
that can run the component we created.

See [`run-transpiled.js`](./run-transpiled.js) for more information.

> [!NOTE]
> WebAssembly components are *not* the same as WebAssembly Modules (asm.js, emscripten, etc),
> they are much more powerful and support many more features.
>
> If you don't know what any of the above means, don't worry about it -- check out the [Component Model Book][cm-book],
> or keep following along and experiment!

[sm]: https://github.com/bytecodealliance/StarlingMonkey
[wasi]: https://github.com/WebAssembly/WASI/tree/main
[p2-shims]: https://www.npmjs.com/package/@bytecodealliance/preview2-shim
[cm-book]: https://component-model.bytecodealliance.org/
[wintertc]: https://wintertc.org/
[nodejs-docs-buffer]: https://nodejs.org/api/buffer.html
[nodejs-docs-url]: https://nodejs.org/api/url.html

## Quickstart

To build this example into a demo page that you can visit, run:

```console
npm install
npm run all
```
> [!NOTE]
> Feel free to replace `npm` with whatever npm-compatible tooling you prefer.

The `all` script will:

- Build the component
- Transpile it
- Run the component (which performs a web request)
- Output the information printed by `console.log` usage in the component

<details>
<summary><h4>Expected output</h4></summary>

```console

> node-compat@0.0.1 all
> npm run build; npm run transpile; npm run run-transpiled


> node-compat@0.0.1 build
> npm run build:js && npm run build:component


> node-compat@0.0.1 build:js
> rolldown -c rolldown.config.mjs

<DIR>/component.js  chunk │ size: 76.02 kB

✔ rolldown v1.0.0-rc.5 Finished in 29.79 ms

> node-compat@0.0.1 build:component
> jco componentize -w wit -o dist/component.wasm dist/component.js

OK Successfully written dist/component.wasm.

> node-compat@0.0.1 transpile
> jco transpile dist/component.wasm -o dist/transpiled


  Transpiled JS Component Files:

 - dist/transpiled/component.core.wasm                          11.7 MiB
 - dist/transpiled/component.core2.wasm                         14.4 KiB
 - dist/transpiled/component.d.ts                               2.21 KiB
 - dist/transpiled/component.js                                  417 KiB
 - dist/transpiled/interfaces/wasi-cli-run.d.ts                 0.07 KiB
 - dist/transpiled/interfaces/wasi-cli-stderr.d.ts              0.16 KiB
 - dist/transpiled/interfaces/wasi-cli-stdin.d.ts               0.15 KiB
 - dist/transpiled/interfaces/wasi-cli-stdout.d.ts              0.16 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-input.d.ts      0.17 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-output.d.ts     0.17 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-stderr.d.ts      0.2 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-stdin.d.ts       0.2 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-stdout.d.ts      0.2 KiB
 - dist/transpiled/interfaces/wasi-clocks-monotonic-clock.d.ts  0.37 KiB
 - dist/transpiled/interfaces/wasi-clocks-wall-clock.d.ts        0.2 KiB
 - dist/transpiled/interfaces/wasi-filesystem-preopens.d.ts     0.19 KiB
 - dist/transpiled/interfaces/wasi-filesystem-types.d.ts        2.93 KiB
 - dist/transpiled/interfaces/wasi-http-outgoing-handler.d.ts   0.47 KiB
 - dist/transpiled/interfaces/wasi-http-types.d.ts              9.02 KiB
 - dist/transpiled/interfaces/wasi-io-error.d.ts                0.15 KiB
 - dist/transpiled/interfaces/wasi-io-poll.d.ts                 0.23 KiB
 - dist/transpiled/interfaces/wasi-io-streams.d.ts              0.88 KiB
 - dist/transpiled/interfaces/wasi-random-random.d.ts           0.14 KiB


> node-compat@0.0.1 run-transpiled
> node run-transpiled.js

URL: https://example.com/api/users?page=1&limit=10&sort=name
  Protocol: https:
  Host: example.com
  Hostname: example.com
  Port: (default)
  Pathname: /api/users
  Hash: (none)
  Queries:
    page: 1
    limit: 10
    sort: name

  Buffer info:
    Length: 55 bytes
    Hex: 68747470733a2f2f6578616d706c652e636f6d2f6170692f75736572733f706167653d31266c696d69743d313026736f72743d6e616d65
    Base64: aHR0cHM6Ly9leGFtcGxlLmNvbS9hcGkvdXNlcnM/cGFnZT0xJmxpbWl0PTEwJnNvcnQ9bmFtZQ==

URL: https://shop.example.com:8080/products/electronics?category=laptops&price_max=2000#reviews
  Protocol: https:
  Host: shop.example.com:8080
  Hostname: shop.example.com
  Port: 8080
  Pathname: /products/electronics
  Hash: #reviews
  Queries:
    category: laptops
    price_max: 2000

  Buffer info:
    Length: 90 bytes
    Hex: 68747470733a2f2f73686f702e6578616d706c652e636f6d3a383038302f70726f64756374732f656c656374726f6e6963733f63617465676f72793d6c6170746f70732670726963655f6d61783d323030302372657669657773
    Base64: aHR0cHM6Ly9zaG9wLmV4YW1wbGUuY29tOjgwODAvcHJvZHVjdHMvZWxlY3Ryb25pY3M/Y2F0ZWdvcnk9bGFwdG9wcyZwcmljZV9tYXg9MjAwMCNyZXZpZXdz

URL: http://localhost:3000/admin/dashboard?token=abc123&debug=true
  Protocol: http:
  Host: localhost:3000
  Hostname: localhost
  Port: 3000
  Pathname: /admin/dashboard
  Hash: (none)
  Queries:
    token: abc123
    debug: true

  Buffer info:
    Length: 61 bytes
    Hex: 687474703a2f2f6c6f63616c686f73743a333030302f61646d696e2f64617368626f6172643f746f6b656e3d6162633132332664656275673d74727565
    Base64: aHR0cDovL2xvY2FsaG9zdDozMDAwL2FkbWluL2Rhc2hib2FyZD90b2tlbj1hYmMxMjMmZGVidWc9dHJ1ZQ==

```

</details>

#### Aside: Components & WebAssembly System Interface (WASI)

WebAssembly Components are built against the system interfaces available in [WASI][wasi].

For example, using a tool called [`wasm-tools`][wasm-tools] we can see the imports and exports
of the component we've just built:

```
wasm-tools component wit dist/component.wasm
```

You should see output that looks something like this:

```wit
package root:component;

world root {
  import wasi:cli/environment@0.2.3;
  import wasi:io/poll@0.2.3;
  import wasi:clocks/monotonic-clock@0.2.3;
  import wasi:io/error@0.2.3;
  import wasi:io/streams@0.2.3;
  import wasi:http/types@0.2.3;
  import wasi:cli/stdin@0.2.3;
  import wasi:cli/stdout@0.2.3;
  import wasi:cli/stderr@0.2.3;
  import wasi:cli/terminal-input@0.2.3;
  import wasi:cli/terminal-output@0.2.3;
  import wasi:cli/terminal-stdin@0.2.3;
  import wasi:cli/terminal-stdout@0.2.3;
  import wasi:cli/terminal-stderr@0.2.3;
  import wasi:clocks/wall-clock@0.2.3;
  import wasi:filesystem/types@0.2.3;
  import wasi:filesystem/preopens@0.2.3;
  import wasi:random/random@0.2.3;
  import wasi:http/outgoing-handler@0.2.3; /// <---- This import is used by `fetch()`!

  export wasi:http/incoming-handler@0.2.3; /// <---- This export enables responding to HTTP requests
}

/// ... elided ...
```

> [!NOTE]
> The *meaning* of all of these `import`s and `export`s is somewhat out of scope for this example, so we won't discuss
> further, but please check out the [Component Model Book][cm-book] for more details.

[wasm-tools]: https://github.com/bytecodealliance/wasm-tools

### Transpile the WebAssembly component for NodeJS

As we noted earlier, WebAssembly Components are built against the system interfaces available in [WASI][wasi].

One of the benefits of using components and WASI is that we can *reimplement* those interfaces when
the platform changes (this is sometimes called "virtual platform layering"). The host running the WebAssembly
component can provide dependencies as necessary.

Thanks to `jco transpile` we can take our WebAssembly component (or any other WebAssembly component) and use
it *on NodeJS*, by converting the WebAssembly component into code that `node` *can run today* and
[providing shims/polyfills][npm-p2-shim] for WASI functionality as necessary.

In practice this means producing a bundle of JS + WebAssembly Modules that can run in NodeJS:

```console
npm run transpile
```

<details>
<summary><h4>Expected output</h4></summary>

You should see output like the following:

```

> node-compat@0.0.1 transpile
> jco transpile dist/component.wasm -o dist/transpiled


  Transpiled JS Component Files:

 - dist/transpiled/component.core.wasm                          11.7 MiB
 - dist/transpiled/component.core2.wasm                         14.4 KiB
 - dist/transpiled/component.d.ts                               2.21 KiB
 - dist/transpiled/component.js                                  417 KiB
 - dist/transpiled/interfaces/wasi-cli-run.d.ts                 0.07 KiB
 - dist/transpiled/interfaces/wasi-cli-stderr.d.ts              0.16 KiB
 - dist/transpiled/interfaces/wasi-cli-stdin.d.ts               0.15 KiB
 - dist/transpiled/interfaces/wasi-cli-stdout.d.ts              0.16 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-input.d.ts      0.17 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-output.d.ts     0.17 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-stderr.d.ts      0.2 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-stdin.d.ts       0.2 KiB
 - dist/transpiled/interfaces/wasi-cli-terminal-stdout.d.ts      0.2 KiB
 - dist/transpiled/interfaces/wasi-clocks-monotonic-clock.d.ts  0.37 KiB
 - dist/transpiled/interfaces/wasi-clocks-wall-clock.d.ts        0.2 KiB
 - dist/transpiled/interfaces/wasi-filesystem-preopens.d.ts     0.19 KiB
 - dist/transpiled/interfaces/wasi-filesystem-types.d.ts        2.93 KiB
 - dist/transpiled/interfaces/wasi-http-outgoing-handler.d.ts   0.47 KiB
 - dist/transpiled/interfaces/wasi-http-types.d.ts              9.02 KiB
 - dist/transpiled/interfaces/wasi-io-error.d.ts                0.15 KiB
 - dist/transpiled/interfaces/wasi-io-poll.d.ts                 0.23 KiB
 - dist/transpiled/interfaces/wasi-io-streams.d.ts              0.88 KiB
 - dist/transpiled/interfaces/wasi-random-random.d.ts           0.14 KiB
```

</details>

The most important file in the generated bundle is `dist/transpiled/component.js` -- this is
the entrypoint for a (NodeJS, browser) script that wants to use the component we've just built.

[npm-p2-shim]: https://www.npmjs.com/package/@bytecodealliance/preview2-shim

## Run the Demo

To be able to use our transpiled component, the included [`demo.js` script](./scripts/demo.js) which uses `jco serve`
to serve the component.

To run the demo:

```console
npm run run-transpiled
```

<details>
<summary><h4>Expected output</h4></summary>

You should see output like the following:

```

> node-compat@0.0.1 run-transpiled
> node run-transpiled.js

URL: https://example.com/api/users?page=1&limit=10&sort=name
  Protocol: https:
  Host: example.com
  Hostname: example.com
  Port: (default)
  Pathname: /api/users
  Hash: (none)
  Queries:
    page: 1
    limit: 10
    sort: name

  Buffer info:
    Length: 55 bytes
    Hex: 68747470733a2f2f6578616d706c652e636f6d2f6170692f75736572733f706167653d31266c696d69743d313026736f72743d6e616d65
    Base64: aHR0cHM6Ly9leGFtcGxlLmNvbS9hcGkvdXNlcnM/cGFnZT0xJmxpbWl0PTEwJnNvcnQ9bmFtZQ==

URL: https://shop.example.com:8080/products/electronics?category=laptops&price_max=2000#reviews
  Protocol: https:
  Host: shop.example.com:8080
  Hostname: shop.example.com
  Port: 8080
  Pathname: /products/electronics
  Hash: #reviews
  Queries:
    category: laptops
    price_max: 2000

  Buffer info:
    Length: 90 bytes
    Hex: 68747470733a2f2f73686f702e6578616d706c652e636f6d3a383038302f70726f64756374732f656c656374726f6e6963733f63617465676f72793d6c6170746f70732670726963655f6d61783d323030302372657669657773
    Base64: aHR0cHM6Ly9zaG9wLmV4YW1wbGUuY29tOjgwODAvcHJvZHVjdHMvZWxlY3Ryb25pY3M/Y2F0ZWdvcnk9bGFwdG9wcyZwcmljZV9tYXg9MjAwMCNyZXZpZXdz

URL: http://localhost:3000/admin/dashboard?token=abc123&debug=true
  Protocol: http:
  Host: localhost:3000
  Hostname: localhost
  Port: 3000
  Pathname: /admin/dashboard
  Hash: (none)
  Queries:
    token: abc123
    debug: true

  Buffer info:
    Length: 61 bytes
    Hex: 687474703a2f2f6c6f63616c686f73743a333030302f61646d696e2f64617368626f6172643f746f6b656e3d6162633132332664656275673d74727565
    Base64: aHR0cDovL2xvY2FsaG9zdDozMDAwL2FkbWluL2Rhc2hib2FyZD90b2tlbj1hYmMxMjMmZGVidWc9dHJ1ZQ==
```

</details>
