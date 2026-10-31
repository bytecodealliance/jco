# Conversion contract

Conversion functions are named exports at `intrinsics/conversion` and satisfy
`ConversionModule`. The eight integer coercions take `StrictNumericContext`
(`{ strict: boolean }`) followed by the value. Context-free character, string,
JSON/result-string, numeric validation and i64 split/merge helpers take operands
only. Strict 32-bit validation precedes coercion; 64-bit conversions first apply
`BigInt`, then validate the converted range. Historical `i32ToChar` fromCharCode
and signed-low-word `mergeInt64` behavior are preserved.

`initializeBitcast32()` returns aliased mutable i32/f32 views;
`initializeBitcast64()` returns aliased i64/f64 views. They return storage, with no
operation table. Generated bindings call only selected initializers, once per
instantiation, and pass the same capability to both conversion directions.
Different instantiations never share scratch storage. Assignment/read sequencing
preserves reentrant coercion. Importing scalar helpers allocates no scratch arrays,
codecs or scheduler state.

```js
import { initializeBitcast32, i32ToF32, toUint32 } from '@bytecodealliance/jco-cm-runtime/intrinsics/conversion';

const scratch = initializeBitcast32();
const one = i32ToF32(scratch, 0x3f800000);
const wrapped = toUint32({ strict: false }, -1);
```

Custom runtimes implementing earlier v1 resource-only output must publish the new
conversion subpath when adopting this compiler. They may re-export defaults or
supply matching named operations with the documented structural capabilities.
A selected override of `requireValidNumericPrimitive` does not intercept default
`toUint32`'s own static dependency; interception must be explicit in an overriding
`toUint32` implementation.

[All intrinsic contracts](README.md) · [Runtime API](../runtime.md)
