# `node:buffer`

| Imports | Implementation |
| --- | --- |
| `node:buffer` | unenv's portable Buffer core with a Jco public adapter |

The Buffer core comes from `unenv`'s wrapper around the MIT-licensed Feross
[`buffer`][feross-buffer] implementation. Jco adds the Node-facing module shape,
one shared `globalThis.Buffer`, and policy for exports that cannot be faithfully
provided in the guest.

Supported behavior includes common text and binary encodings, allocation and
filling, concatenation, comparison, integer and floating-point IO, searching,
slicing, copying, swapping, and JSON conversion. `atob()` and `btoa()` use runtime
globals when available and portable Buffer fallbacks otherwise.

## Behavioral limits

There are intentional limits:

- `Buffer()` and `new Buffer()` are deprecated in Node and throw
  `ERR_JCO_UNSUPPORTED_DEPRECATED_NODE_API`; use `Buffer.from()`,
  `Buffer.alloc()`, or `Buffer.allocUnsafe()` instead.
- `SlowBuffer` is deprecated and throws the same error.
- `isAscii`, `isUtf8`, `resolveObjectURL`, and `transcode` currently throw
  `ERR_JCO_UNSUPPORTED_NODE_API`.
- `Blob` and `File` use engine globals when those globals exist; otherwise their
  fallback constructors throw an unsupported-API error.
- The current portable core does not support the `base64url` encoding.

[feross-buffer]: https://github.com/feross/buffer
