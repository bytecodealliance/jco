# TTY source provenance

The TypeScript port targets **Node v24.20.0**, commit
[`71b8b174857e25106d39b61a9e6f30d927da8b01`](https://github.com/nodejs/node/tree/71b8b174857e25106d39b61a9e6f30d927da8b01),
the same pin as the readline port whose cursor callbacks it reuses. The upstream
notices are retained in each ported source file.

| Local file      | Upstream source                   | Local adaptations                                                                    |
| --------------- | --------------------------------- | ------------------------------------------------------------------------------------ |
| `core.ts`       | `lib/tty.js`                      | `tty_wrap` becomes the `jco:node/tty` provider; `net.Socket` becomes `stream.Duplex` |
| `colors.ts`     | `lib/internal/tty.js`             | Default environment from the provider; `process` as an optional global               |
| `types.ts`      | `@types/node` 24 tty declarations | Structural stream types shared with the stream port; Jco-owned provider contract     |
| `host-utils.ts` | Jco host boundary                 | Error records with Node's `info` field                                               |

`unenv@2.0.0-rc.24` was inspected at `node/tty`: `isatty()` is always `false` and the
streams are bare classes with a fixed 80x24 size whose `write` calls `console.log`.
None of it is reused or admitted to Jco's alias list.

WASI 0.2's `wasi:cli/terminal-*` interfaces only answer "is stdin/stdout/stderr a
terminal", carry no raw mode or window size, and cannot be bound by componentize-js
today, so the module is host-backed like `node:console` and `node:os`. Descriptors
are the host process's own: `new tty.WriteStream(1)` is the embedding process's
standard output when that is a terminal.

## Runtime differences

- The prototype chain is `WriteStream → TerminalOutput → Duplex → Readable → Stream →
EventEmitter` (`ReadStream → TerminalInput → …`): an internal terminal stream carries
  the `_read`/`_write`/`_destroy` plumbing where Node has `net.Socket`, which does not
  exist without `wasi:sockets`, so `instanceof net.Socket` is false. Every documented
  member of both public classes is present and enumerable as in Node.
- A `ReadStream` is not writable and a `WriteStream` is not readable. Node's streams
  are sockets over a descriptor opened read-write; the unused side is disabled here.
- Reading blocks the component. A flowing `ReadStream` pulls one chunk at a time
  from the provider and emits `'data'` synchronously between pulls; `pause()` stops
  pulling after the current chunk. There is no event loop to interleave other work
  while the terminal is idle.
- `'resize'` is emitted only by `_refreshSize()`. A component receives no `SIGWINCH`,
  so the application decides when to re-query the size.
- `getColorDepth()`/`hasColors()` read the provider's environment when none is
  passed. The `process.platform === 'win32'` branch reads a `process` global when one
  exists and answers Windows' 16-color floor, since the release probe needs `node:os`;
  `warnOnDeactivatedColors` uses `process.emitWarning` when a `process` global has it.
- `setRawMode()` failures are emitted as `'error'` with the provider's record, as Node
  emits its `ErrnoException`.
- Construction fails before any stream exists, as in Node: `ERR_INVALID_FD` for a bad
  descriptor and the provider's `ERR_TTY_INIT_FAILED` (with `errno`, `syscall` and
  `info`) for a descriptor that is not a terminal. With the deny-by-default provider
  every operation, including `isatty` on an in-range descriptor, throws
  `ERR_JCO_TTY_ADAPTER_REQUIRED`.

No API in `node:tty` is deprecated at the pin.
