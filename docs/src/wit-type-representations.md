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

Jco represents options as an optional value or undefined, so some examples:

| Type                  | Representation (TS)                     | Example                               |
|-----------------------|-----------------------------------------|---------------------------------------|
| `option<u32>`         | <code>number \| undefined</code>                    | `option<u32>` -> <code>number \| undefined</code> |
| `option<option<u32>>` | <code>{ tag: "some" \| "none", val: number }</code> | `option<u32>` -> <code>number \| undefined</code> |

> [!WARNING]
> "single level" `option`s are easy to reason about, but the doubly nested case (`option<option<_>>`) is more complex.
>
> Due to the important distinction between a missing optional versus an `option` that *contains* an empty value,
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
  if (n === undefined) { return "no n provided"; }
  return "n was provided";
}
```

## Result (`result`)

`Result` types, as a general concept represent a result that *may or may not* be present, due to a failure. A result value either contains
a value that represents a completed computation (`SuccessType`), or some "error" that indicates a failure (`ErrorType`).

You can think of the type of a `Result` as:

```
Result<SuccessType, ErrorType>
```

The value you ultimately deal with is one *or* the other -- either the successful result or the error that represents the failure.

### WIT Syntax

```wit
result<_, string>
result<, string>
result<t,e>
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
  if (n == 42) { return "correct"; }
  throw "not correct";
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
  const plainError = new Error("Error for JS users");
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

### WIT Syntax

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
