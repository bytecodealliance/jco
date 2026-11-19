# jco issue 2510

C reproduction for https://github.com/bytecodealliance/jco/issues/2510.

The command accepts a loopback TCP connection through the WASI 0.2 sockets
API in `<wasi/wasip2.h>`, then drops the accepted socket's streams before the
socket's own pollable. That is a valid drop order, and the one wasi-libc uses
to close a socket.

It requires wasi-sdk 25 or newer with `wasm32-wasip2` support.
