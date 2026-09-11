# `node:tty`

| Imports | Implementation |
| --- | --- |
| `node:tty` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/tty` |

A component has no terminal of its own, and WASI 0.2 can only say whether its
standard streams are terminals. `node:tty` therefore resolves against
`jco:node/tty@0.1.0`, which addresses the embedding process's descriptors as Node
does: `isatty(fd)`, a handle per descriptor and direction, raw mode, the window
size, blocking reads, writes, and the environment used for color detection. When
bundled source imports `node:tty`, Jco adds the import to the selected world and
installs `tty.wit` and the shared `types.wit` under `deps/jco-node-0.1.0`.

It is **denied by default**: every operation, including `isatty()` on an in-range
descriptor, throws `ERR_JCO_TTY_ADAPTER_REQUIRED` until the application maps a
provider. jco-std ships one for Node:

```console
jco transpile component.wasm \
  --map 'jco:node/tty@0.1.0=@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/tty/host/node'
```

With it, `new tty.WriteStream(1)` is the embedding process's standard output when
that is a terminal, and fails with Node's own `ERR_TTY_INIT_FAILED` (with `errno`,
`syscall` and `info`) when it is not. `process.stdin` and `process.stdout` remain
unsupported on the process facade, so applications construct the streams from
descriptors explicitly. Because `readline` and the REPL default `terminal` to
`output.isTTY`, these streams are what makes an interactive session work:

```js
import { ReadStream, WriteStream } from "node:tty";
import repl from "node:repl";

export function start() {
  const input = new ReadStream(0);
  const output = new WriteStream(1);
  repl.start({ prompt: "app> ", input, output, useGlobal: true });
  input.resume();
}
```

The port follows [Node v24.20.0's `lib/tty.js`](https://github.com/nodejs/node/blob/v24.20.0/lib/tty.js)
and `lib/internal/tty.js`. The pinned unenv tty module answers `isatty() === false`
and writes through `console.log`; it is not used.

## Boundaries

| Surface                                | Behavior                                                                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prototype chain                        | `WriteStream → Duplex → Readable → Stream → EventEmitter` with an internal terminal stream standing in for `net.Socket`; `instanceof net.Socket` is false without `wasi:sockets`.       |
| Stream sides                           | A `ReadStream` is not writable and a `WriteStream` is not readable; Node's sockets open the descriptor read-write.                                                                   |
| Reading                                | Blocks the component. A flowing `ReadStream` pulls one chunk per read and emits `'data'` synchronously between pulls; `pause()` stops after the current chunk. Nothing else runs while the terminal is idle. |
| `'resize'`                             | Emitted only by `_refreshSize()`; a component receives no `SIGWINCH`.                                                                                                                  |
| `getColorDepth()` / `hasColors()`     | Exact port. The environment defaults to the provider's; the Windows branch answers the 16-color floor because the build-number probe needs `node:os`.                                  |
| Standard descriptors on the Node host  | Kept open when a stream is destroyed, as Node keeps its own stdio; descriptors above 2 are closed with the stream. Raw mode is restored when the last read handle goes.              |
