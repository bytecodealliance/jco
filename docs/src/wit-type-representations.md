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
|----------|---------------------------|
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
Alternative variant members may hold *different* types to represent different cases. For example:

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

Jco represents variants as objects with a `tag` that represents the variant, and `data` that represent the content:

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
  data: string[];
}
```

> [!NOTE]
> WIT `variant`'s options may only contain *one* piece of data.
>
> You can work around this limitation of variants by having the contained type be a *tuple*,
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

Jco represents options as as an optional (arrays), so some examples:

| Type          | Representation (TS)  | Example                               |
|---------------|----------------------|---------------------------------------|
| `option<u32>` | `number | undefined` | `option<u32>` -> `number | undefined` |

When used in the context of a `record` (which becomes a [JS Object][mdn-js-obj]), optional values are represented as optional properties (i.e in TS a `propName?: value`).

## Result (`result`)

> [!NOTE]
> See the [Basic types section of the WIT IDL](https://github.com/WebAssembly/component-model/blob/main/design/mvp/WIT.md#types) for more information on Resources


`Result` types, as a general concept represent a result that *may or may not* be present, due to a failure. A result value either contains
a value that represents a completed computation, or some "error" that indicates a failure. You can think
of the type of a result as:

```
Result<SuccessType, ErrorType>
```

In Jco, by default a `result` has two representations depending on whether it is the return type of a function or a nested type. When a result is returned directly from a function,
any thrown error of the function is treated as the result error type, while any direct return value is treated as the result success type.

Consider the following interface:

```wit
interface fallible {
    f: func(n: u32) -> result<string, string>;
}
```

An implementation of the function `fallible.f` would look like the following Typescript:

```ts
function f(n: number): string {
  if (n == 42) { return "correct"; }
  throw "not correct";
}
```

On the other hand, a `result` stored inside a type or used in another context will look like a variant type of the form `{ tag: 'ok', val: SuccessType } | { tag: 'err', val: ErrorType }`. For example:

```wit
interface fallible-reaction {
    r: func(r: result<string, string>) -> string;
}
```

An implementation of thef function `fallible-reaction.r` would look like the following Typescript:

```ts
type Result<T,E> = { tag: 'ok', val: SuccessType } | { tag: 'err', val: ErrorType };

function f(input: Result<string, string>): string {
  switch (input.tag) {
    case 'ok': return `SUCCESS, returned: [${input.val}]";
    case 'err': return `ERROR, returned: [${input.val}]";
    // We we should never reach the case below
    default: throw Error("something has gone seriously wrong");
  }
}
```

### WIT representation

```wit
result<_, string>
result<, string>
```

### Jco representation

In Javsacript, computation that fails or errors are often represented as exceptions -- and depending on how
the `result` is used, Jco adheres to that representations.

When used as an *output* to a function, `throw`ing an error will suffice. Given the following WIT interface:

```wit
add-overflow: func(lhs: u32, rhs: u32) -> result<u32, string>;
```

The following JS function would satistfy the WIT interface:

```js
function addOverflow(lhs, rhs) {
    let sum = lhs + rhs;
    if (Nan.isNan(sum)) {
      throw "ERROR: addition produced non-number value";
    } else if (sum > 4294967295) {
      throw "ERROR: u32 overflow";
    }
    return sum;
}
```

While JS automatically converts numbers, we must be careful to not attempt passing a number
that would *not* fit in a `u32` (unsigned 32 bit integer) via WebAssembly.

> [NOTE]
> How JS treats large numbers is not in focus here, but it is worth noting that
> `Number.MAX_VALUE + Number.MAX_VALUE === Infinity`.

### Typescript Schema

```
interface Result {
  ok: null
  data: null
}
```

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
|----------------------|---------------------|--------------------------------------------|
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
|------------|---------------------|------------------------------|
| `list<u8>` | `Uint8Array`        | `list<u8>` -> `Uint8Array`   |
| `list<t>`  | `T[]`               | `list<string>` -> `string[]` |

## Resources (`resource`)

> [!NOTE]
> See the [WIT IDL description of Resources](https://github.com/WebAssembly/component-model/blob/main/design/mvp/WIT.md#item-resource) for more information

Resources represent objects that can not be trivially serialized and send copied to another component or the host. Components or host expose resources almost as a reference to internal state that methods can be called on -- without providing the actual internals of the resource in question.

### WIT representation

```wit
resource blob {
    constructor(init: list<u8>);
    write: func(bytes: list<u8>);
    read: func(n: u32) -> list<u8>;
    merge: static func(lhs: borrow<blob>, rhs: borrow<blob>) -> blob;
}
```

### Jco representation

The example above could be represented with the following class in Typescript pseudo-code:

```ts
class Blob {
    constructor(init: Uint8Array);

    write(bytes: Uint8Array);

    read(n: number): UInt8Array;

    static merge(lhs: Uint8Array, rhs: Uint8Array): Blob;
}
```
