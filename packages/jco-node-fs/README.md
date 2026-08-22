# `@bytecodealliance/jco-node-fs`

Native Node.js filesystem helpers used by Jco's WASI shims.

The package intentionally exposes only filesystem operations that the Node.js
standard library cannot provide. It is not a general-purpose filesystem API.

```js
import { open } from 'node:fs/promises';
import { fadvise } from '@bytecodealliance/jco-node-fs';

const file = await open('data.bin', 'r');
try {
    fadvise(file.fd, 0n, 0n, 'sequential');
} finally {
    await file.close();
}
```
