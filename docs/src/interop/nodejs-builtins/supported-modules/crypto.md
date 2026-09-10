# Crypto

`node:crypto` provides synchronous SHA-1 and SHA-256 hashing through `createHash`,
`createHmac`, and `hash`, including the digest operations used by Express ETags
and cookie signatures. Other digest algorithms are unsupported.

Random helpers use the component engine’s WebCrypto implementation, backed by
`wasi:random`. The `webcrypto` and `subtle` exports delegate to that implementation.
Node-shaped cipher, signing, key-object, certificate, and key-derivation operations
throw explicit unsupported errors; this is not full Node crypto compatibility.

```js
import { createHash } from 'node:crypto';

const digest = createHash('sha256').update('hello').digest('hex');
```
