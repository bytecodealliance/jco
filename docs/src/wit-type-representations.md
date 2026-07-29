# WIT Type Representations

Similar to any other guest langauge, there are multiple type systems in play when dealing with JS WebAssembly components.

Types represented in [WebAssembly Interface Types ("WIT")][wit] must be converted down to types that are familiar for Javascript,
and [Typescript][ts] (if dealing with `jco types` or `jco guest-types` subcommands).

This document details the type representations and usage for types that are defined in WIT and built into components.

[wit]: https://github.com/WebAssembly/component-model/blob/main/design/mvp/WIT.md
[ts]: https://www.typescriptlang.org/

## Basic types

Here is a basic table of conversions between WIT types and JS types:

More complicated types that are built into WIT but require more work to translate are explained below.

| WIT type | JS Type                   |
| -------- | ------------------------- |
| `u8`     | `number`                  |
| `u16`    | `number`                  |
| `u32`    | `number`                  |
| `u64`    | [`BigInt`][mdn-js-bigint] |
| `s8`     | `number`                  |
| `s16`    | `number`                  |
| `s32`    | `number`                  |
| `s64`    | [`BigInt`][mdn-js-bigint] |
| `f32`    | `number`                  |
| `f64`    | `number`                  |
| `bool`   | `boolean`                 |
| `char`   | `string`                  |
| `string` | `string`                  |

[mdn-js-bigint]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt

## Variants (`variant`)

> [!NOTE]
> See the [Variant section of the WIT IDL](https://github.com/WebAssembly/component-model/blob/main/design/mvp/WIT.md#item-variant-one-of-a-set-of-types) for more information on Variants

Variants are like basic enums in most languages with one exception; members of the variant can hold a single data type.
Alternative variant members may hold _different_ types to represent different cases. For example:

```wit
variant exit-code {
  success,
  failure-code(u32),
  failure-msg(string),
}
```

### WIT syntax

```wit
variant filter {
    all,
    none,
    some(list<string>),
}
```

### Jco Representation

Jco represents variants as objects with a `tag` that represents the variant, and `val` that represents the content:

For example, pseudo Typescript for the of the above `filter` variant would look like the following:

```ts
// Filter with all
{
  tag: 'all';
}

// Filter with None
{
  tag: 'none';
}

// Filter with some and a list of strings
{
  tag: 'some';
  val: string[];
}
```

> [!NOTE]
> WIT `variant`'s options may only contain _one_ piece of data.
>
> You can work around this limitation of variants by having the contained type be a _tuple_,
> (e.g. `tuple<string, u32, string>`), or using a named record as the related data.

## Records (`record`)

### WIT Syntax

```wit
record person {
    name: string,
    age: u32,
    favorite-color: option<string>,
}
```

### Jco Representation

Jco represents records as the [Javascript Object basic data type][mdn-js-obj]:

Given the WIT record above, you can expect to deal with an object similar to the following Typescript:

```ts
interface Person {
    person: string;
    age: number;
    favoriteColor?: number;
}
```

> [!NOTE]
> If using `jco guest-types` or `jco types`, you will be able to use Typescript types that
> properly constrain the Typescript code you write.

[mdn-js-obj]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object

## Options (`option`)

### WIT Syntax

```wit
option<u32, u32>
option<string, u32>
```

### Jco Representation

Jco represents options as an optional value or undefined, so some examples:

| Type                  | Representation (TS)                      | Example                                |
| --------------------- | ---------------------------------------- | -------------------------------------- |
| `option<u32>`         | `number \| undefined`                    | `option<u32>` -> `number \| undefined` |
| `option<option<u32>>` | `{ tag: "some" \| "none", val: number }` | `option<u32>` -> `number \| undefined` |

> [!WARNING]
> "single level" `option`s are easy to reason about, but the doubly nested case (`option<option<_>>`) is more complex.
>
> Due to the important distinction between a missing optional versus an `option` that _contains_ an empty value,
> doubly-nested (or more) `option`s are encoded with the object encoding described above, rather than as an optional value.

### `option`s in context: Records

When used in the context of a `record` (which becomes a [JS Object][mdn-js-obj]), optional values are represented as optional properties (i.e in TS a `propName?: value`).

### `option`s in context: Function arguments/return values

When used in the context of arguments or return to a function, single level `option`s are represented as optional values:

Consider the following interface:

```wit
interface optional {
    f: func(n: option<u32>) -> string;
}
```

An implementation of the function `optional.f` would look like the following Typescript:

```ts
function f(n?: number): string {
    if (n === undefined) {
        return 'no n provided';
    }
    return 'n was provided';
}
```

## Result (`result`)

`Result` types, as a general concept represent a result that _may or may not_ be present, due to a failure. A result value either contains
a value that represents a completed computation (`SuccessType`), or some "error" that indicates a failure (`ErrorType`).

You can think of the type of a `Result` as:

```
Result<SuccessType, ErrorType>
```

The value you ultimately deal with is one _or_ the other -- either the successful result or the error that represents the failure.

### WIT Syntax

```wit
result<_, string>
result<, string>
result<t,e>
```

### Jco representation

In Javsacript, computation that fails or errors are often represented as exceptions -- and depending on how
the `result` is used, Jco adheres to that representations.

When used as an _output_ to a function, `throw`ing an error will suffice. Given the following WIT interface:

```wit
add-overflow: func(lhs: u32, rhs: u32) -> result<u32, string>;
```

The following JS function would satistfy the WIT interface:

```js
function addOverflow(lhs, rhs) {
    let sum = lhs + rhs;
    if (Nan.isNan(sum)) {
        throw 'ERROR: addition produced non-number value';
    } else if (sum > 4294967295) {
        throw 'ERROR: u32 overflow';
    }
    return sum;
}
```

While JS automatically converts numbers, we must be careful to not attempt passing a number
that would _not_ fit in a `u32` (unsigned 32 bit integer) via WebAssembly.

> [!NOTE]
> How JS treats large numbers is not in focus here, but it is worth noting that
> `Number.MAX_VALUE + Number.MAX_VALUE === Infinity`.

### Typescript Schema

```
type Result<T,E> = { tag: 'ok', val: T } | { tag: 'err', val: E };
```

### `result`s in context: Function return values

When a result is returned directly from a function, any thrown error of the function is treated as the result error type,
while any direct return value is treated as the result success type.

Consider the following interface:

```wit
interface fallible {
    f: func(n: u32) -> result<string, string>;
}
```

An implementation of the function `fallible.f` would look like the following Typescript:

```ts
function f(n: number): string {
    if (n == 42) {
        return 'correct';
    }
    throw 'not correct';
}
```

### `result`s in context: Container types (`record`, `optional`, etc)

A `result` stored inside a container type or in non-function argument/return contexts will look like a variant
type of the form `{ tag: 'ok', val: SuccessType } | { tag: 'err', val: ErrorType }`.

For example, consider the following WIT interface:

```wit
interface fallible-reaction {
    r: func(r: result<string, string>) -> string;
}
```

An implementation of the function `fallible-reaction.r` would look like the following Typescript:

```ts
type Result<T,E> = { tag: 'ok', val: T } | { tag: 'err', val: E };

function f(input: Result<string, string>): string {
  switch (input.tag) {
    case 'ok': return `SUCCESS, returned: [${input.val}]";
    case 'err': return `ERROR, returned: [${input.val}]";
    // We we should never reach the case below
    default: throw Error("something has gone seriously wrong");
  }
}
```

### `result` considerations: Idiomatic JS errors for Host implementations

When running a component in a JS host, it is likely for host functions to throw real JS errors (objects which are descendants of the [`Error` global object][mdn-js-error]),
rather than the exact type expected by Jco.

This means that the default conversion mechanism for Jco would be a JS anti-pattern (i.e. `throw 12345` versus `throw new Error("error code 12345")`).

To ensure smooth use of Jco-generated code from hosts, `Error` objects with a `payload` property will have the payload extracted as the result error type.

Consider the following WIT:

```wit
type error-code = u32;

interface only-throws {
    just-throw: func() -> result<string, error-code>;
}
```

Consider the following **host** function adhering to the interface, and making use of idiomatic JS errors:

```js
// The below code assumes interaction with a WIT which looks like a
function justThrow() {
    const plainError = new Error('Error for JS users');
    const errorWithPayload = Object.assign(plainError, { payload: 1111 });
    throw errorWithPayload;
}
```

[mdn-js-error]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error

## Tuples (`tuple`)

Tuples are a container type that has a fixed size, types somewhat analogous to a fixed size list.

Tuples can be combined with type renaming to produce types that carry some semantic meaning. For example:

```wit
type point = tuple<u32,u32>
```

Note that `tuple`s can be combined with custom user-defined types like `record`s and `variants`, `option`s and `result`s. For example:

```wit
variant example-var {
    nothing,
    value(u64),
}

record example-rec {
    fst: string,
    snd: u32,
}

type maybe-num = option<u32>;

type num-or-err-str = result<u32, string>;

type examples = tuple<example-rec, example-var, maybe-num, num-or-err-str>;
```

### WIT Syntax

```wit
tuple<u32, u32>
tuple<string, u32>
```

### Jco Representation

Jco represents tuples as lists (arrays), so some examples:

| Type                 | Representation (TS) | Example                                    |
| -------------------- | ------------------- | ------------------------------------------ |
| `tuple<u32, u32>`    | `[number, number]`  | `tuple<u32, u32>` -> `[number, number]`    |
| `tuple<string, u32>` | `[string, number]`  | `tuple<string, u32>` -> `[string, number]` |

## List (`list`)

### WIT Syntax

```
list<u8>
list<string>
```

### Jco Representation

Jco represents lists with native Javscript Arrays, with the exception of a `list<u8>`:

| Type       | Representation (TS) | Example                      |
| ---------- | ------------------- | ---------------------------- |
| `list<u8>` | `Uint8Array`        | `list<u8>` -> `Uint8Array`   |
| `list<t>`  | `T[]`               | `list<string>` -> `string[]` |

## Resources (`resource`)

> [!NOTE]
> See the [WIT IDL description of Resources](https://github.com/WebAssembly/component-model/blob/main/design/mvp/WIT.md#item-resource) for more information

Resources represent values that cannot be copied across a component boundary. A resource
handle refers to state owned by the resource's provider, without exposing that state to its
consumer. In JavaScript, Jco represents the handle as an object whose methods call back into
the provider.

Resources are useful for stateful or platform-specific values such as files, sockets, and HTTP
bodies. Unlike a WIT `record`, passing a resource does not serialize all of its fields.

The examples below use a `blob` resource:

### WIT Syntax

```wit
package docs:resources;

interface blobs {
    resource blob {
        constructor(init: list<u8>);
        write: func(bytes: list<u8>);
        read: func() -> list<u8>;
        merge: static func(lhs: borrow<blob>, rhs: borrow<blob>) -> blob;
    }
}

world imports-blobs {
    import blobs;
}

world exports-blobs {
    export blobs;
}
```

### Jco representation

The resource is represented as a class. WIT kebab-case names become JavaScript camelCase
for functions and PascalCase for classes. The `blob` resource above therefore has the
following approximate TypeScript shape:

```ts
class Blob implements Disposable {
    constructor(init: Uint8Array) {}

    write(bytes: Uint8Array): void {}

    read(): Uint8Array {}

    static merge(lhs: Blob, rhs: Blob): Blob {}

    [Symbol.dispose](): void {}
}
```

The exact declaration depends on whether the resource is imported or exported. Run
`jco guest-types` when implementing a JavaScript guest, or inspect the declarations emitted
by `jco transpile` when using a component from a JavaScript host. The generated types are
the source of truth for the binding being used.

### Imports and exports are from the guest's perspective

It is useful to identify the provider and consumer before writing any JavaScript:

| WIT world item | Resource provider | Resource consumer |
| -------------- | ----------------- | ----------------- |
| `import blobs` | Host              | Guest component   |
| `export blobs` | Guest component   | Host              |

An imported resource is implemented by the host and passed to the component during
instantiation. An exported resource is implemented by the guest and returned to the host
as part of the component's exports.

### Ownership and borrowing

A resource value is a handle with an associated lifetime. WIT uses two handle modes:

- `own<blob>` transfers ownership to the callee. The receiving side is then responsible for
  eventually dropping the handle.
- `borrow<blob>` temporarily makes the handle available to the callee. Ownership remains
  with the caller, and the callee must not keep using the handle after the call returns.

Writing `blob` in a result or parameter is shorthand for an owned handle where WIT permits
that shorthand. Resource methods implicitly borrow `self`, so calling `blob.read()` does not
consume `blob`. In the example, `merge` borrows both arguments and returns a new owned
resource.

When a generated resource class implements `Disposable`, release it deterministically with
a `using` declaration:

```ts
{
    using blob = new Blob(new Uint8Array([1, 2, 3]));
    blob.write(new Uint8Array([4]));
    console.log(blob.read());
} // blob[Symbol.dispose]() is called here
```

The equivalent JavaScript without a `using` declaration is:

```js
const blob = new Blob(new Uint8Array([1, 2, 3]));
try {
    console.log(blob.read());
} finally {
    blob[Symbol.dispose]();
}
```

> [!WARNING]
> Do not use a resource after disposing it or after passing it to a parameter that takes
> `own<blob>`. JavaScript garbage collection is not a substitute for deterministic cleanup
> when the underlying resource holds files, sockets, or other limited host state.

Whether `[Symbol.dispose]()` appears on a particular binding is recorded in its generated
declaration. A provider may also implement `[Symbol.dispose]()` as a cleanup hook; Jco calls
that hook when the corresponding owned handle is dropped.

### Importing a host resource into a guest

The `imports-blobs` world declares that the guest needs the host to provide the `blobs`
interface. Generate types for the guest implementation with:

```console
jco guest-types wit --world-name imports-blobs -o generated
```

The generated ambient module uses the WIT package and interface name. Guest TypeScript can
import the resource class, construct it, and call its methods:

```ts
/// <reference path="./generated/imports-blobs.d.ts" />
import { Blob } from 'docs:resources/blobs';

export function processBytes(): Uint8Array {
    using left = new Blob(new Uint8Array([1, 2]));
    using right = new Blob(new Uint8Array([3, 4]));
    using merged = Blob.merge(left, right);

    merged.write(new Uint8Array([5]));
    return merged.read();
}
```

`Blob` is supplied by the host even though it looks like a normal class to the guest. The
guest can only observe the operations described by WIT.

#### Providing the imported resource from the host

The host implements the resource with a JavaScript class. Its private fields remain entirely
on the host:

```ts
class HostBlob {
    #bytes: number[];

    constructor(init: Uint8Array) {
        this.#bytes = Array.from(init);
    }

    write(bytes: Uint8Array): void {
        this.#bytes.push(...bytes);
    }

    read(): Uint8Array {
        return Uint8Array.from(this.#bytes);
    }

    static merge(lhs: HostBlob, rhs: HostBlob): HostBlob {
        return new HostBlob(Uint8Array.from([...lhs.#bytes, ...rhs.#bytes]));
    }

    [Symbol.dispose](): void {
        this.#bytes.length = 0;
    }
}
```

Transpile the component with explicit instantiation support:

```console
jco transpile component.wasm -o transpiled --instantiation=async
```

Then provide the class under the WIT interface's fully qualified name:

```ts
import { readFile } from 'node:fs/promises';
import { instantiate } from './transpiled/component.js';

const loader = async (path: string) => WebAssembly.compile(await readFile(new URL(path, import.meta.url)));

const instance = await instantiate(loader, {
    'docs:resources/blobs': {
        Blob: HostBlob,
    },
});
```

The property names match the generated JavaScript names: the WIT resource `blob` becomes
`Blob`. Jco invokes methods with the original resource object as `this`, so private and
per-instance state work as they do on an ordinary class.

Real components often have additional imports, such as WASI interfaces. Those implementations
must be included in the same import object; they are omitted here to keep the resource wiring
visible.

### Exporting a guest resource to the host

The `exports-blobs` world reverses the direction: the guest provides the implementation and
the host consumes it. First generate the guest declarations:

```console
jco guest-types wit --world-name exports-blobs -o generated
```

Use the generated resource type as the contract for the guest class, then export the class
inside an object named after the WIT interface:

```ts
/// <reference path="./generated/exports-blobs.d.ts" />
import type { Blob } from 'docs:resources/blobs';

class GuestBlob implements Blob {
    #bytes: number[];

    constructor(init: Uint8Array) {
        this.#bytes = Array.from(init);
    }

    write(bytes: Uint8Array): void {
        this.#bytes.push(...bytes);
    }

    read(): Uint8Array {
        return Uint8Array.from(this.#bytes);
    }

    static merge(lhs: GuestBlob, rhs: GuestBlob): GuestBlob {
        return new GuestBlob(Uint8Array.from([...lhs.#bytes, ...rhs.#bytes]));
    }

    [Symbol.dispose](): void {
        this.#bytes.length = 0;
    }
}

export const blobs = {
    Blob: GuestBlob,
};
```

The interface export is an object rather than a top-level `Blob` export because the WIT world
exports the complete `blobs` interface. The shape of this object can be checked against the
world module emitted by `jco guest-types`.

#### Using the exported resource from the host

After componentizing and transpiling the guest, instantiate it from the host:

```console
jco componentize guest.js --wit wit --world-name exports-blobs \
    -o component.wasm
jco transpile component.wasm -o transpiled --instantiation=async
```

The instantiated component returns the exported interface. Its resource constructor and
methods can be used like an ordinary JavaScript class:

```ts
import { readFile } from 'node:fs/promises';
import { instantiate } from './transpiled/component.js';

const loader = async (path: string) => WebAssembly.compile(await readFile(new URL(path, import.meta.url)));

const { blobs } = await instantiate(loader, {});

const left = new blobs.Blob(new Uint8Array([1, 2]));
const right = new blobs.Blob(new Uint8Array([3, 4]));
const merged = blobs.Blob.merge(left, right);

console.log(merged.read());
```

The host owns all three handles returned by their constructors and `merge`. If their generated
declarations expose `[Symbol.dispose]()`, the host should dispose each handle when it is no
longer needed, preferably with `using`. Check the declarations generated by the Jco version in
use: disposal support can differ between binding directions and component-model features.

The important distinction is where the classes originate:

| Use case               | Class implementation | Connection at instantiation      | Calls the resource |
| ---------------------- | -------------------- | -------------------------------- | ------------------ |
| Guest imports resource | Host                 | Host passes `{ Blob: HostBlob }` | Guest              |
| Guest exports resource | Guest                | Host receives `{ blobs }`        | Host               |

These are the same WIT resource semantics in opposite directions. In both cases, Jco preserves
the resource's identity and routes method calls to the side that owns its underlying state.

[!NOTE]: #
[!WARNING]: #
