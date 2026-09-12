# `node:string_decoder`

| Imports | Implementation |
| --- | --- |
| `node:string_decoder` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/string-decoder` |

Bundled source can use the documented Node 24 streaming decoder directly:

```js
import { Buffer } from 'node:buffer';
import { StringDecoder } from 'node:string_decoder';

const decoder = new StringDecoder('utf8');

export function decode() {
    return decoder.write(Buffer.from([0xf0, 0x9f])) + decoder.end(Buffer.from([0x8c, 0x8d]));
}
```

Jco maps the import to a guest-local implementation based on Node 24.20.0. It
retains incomplete UTF-8, UTF-16LE, base64, and base64url groups between calls,
supports Node's encoding aliases, and accepts strings or any `ArrayBufferView`.
It reuses the audited Buffer core already used by `node:buffer`; it does not add a
WIT import, callback export, host adapter, or JSPI operation.

Because the adapter is selected only when bundled code resolves
`node:string_decoder`, source graphs that do not import it pay no decoder code or
initialization cost. The bare `string_decoder` name follows normal package
resolution before falling back to this builtin.
