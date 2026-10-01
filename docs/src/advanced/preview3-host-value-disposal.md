# Preview 3 Host Value Disposal

A guest can discard asynchronous values that JavaScript provided before it ever receives
their result. For example:

- It can cancel an `async` import call that is still in flight. A Rust guest does this when
  it drops the future returned by an import, which lowers to the `subtask.cancel` canonical
  built-in.
- It can drop a `future<T>` provided by the host without reading its value. A Rust guest does
  this when it drops a `FutureReader`, cancelling any pending read first.
- It can drop a `stream<T>` provided by the host before reading all of it.

Jco never waits for the host when this happens: the call, future or stream is treated as
cancelled immediately, and anything the host produces later is discarded. The host is
notified by *disposing* the value it provided.

## Async imports and futures

Return a thenable (usually a `Promise`) that implements [`Symbol.asyncDispose`][mdn-async-dispose]
or [`Symbol.dispose`][mdn-dispose]. This applies to promises returned from `async` imports
and to promises lowered into a `future<T>` (whether returned from an import or passed as an
argument to an export):

```js
const imports = {
    'example:websocket/client': {
        connect(url) {
            const controller = new AbortController();
            const pending = openSocket(url, { signal: controller.signal });

            // Called only if the guest discards this call and its result
            pending[Symbol.asyncDispose] = async () => {
                controller.abort();
                // A socket that opened just before cancellation will never reach the guest
                const socket = await pending.catch(() => undefined);
                socket?.close();
            };

            return pending;
        },
    },
};
```

Native promises are extensible, so no wrapper type is needed. Promises without a dispose
method behave exactly as before.

If both methods are present, only `Symbol.asyncDispose` is called.

## Streams

When the guest drops the readable end of a host-provided stream, Jco cleans up the source in
the following order of preference:

1. Calls `return()` on the source's iterator (as `for await ... of` does when breaking out of
   a loop), which runs any `finally` blocks in a started generator.
2. Otherwise, calls the stream object's `Symbol.asyncDispose` or `Symbol.dispose` method.
3. For a `ReadableStream` without the async iterator protocol, cancels its reader.

Unlike futures, a stream is cleaned up whenever the guest drops it, including after it has
read everything, so cleanup must be safe to run on an exhausted source.

Cancelling a single in-progress read of a stream does *not* clean up the source, because the
stream remains usable (see [Preview 3 streams and backpressure](./preview3-streams-and-backpressure.md)).

## Semantics

- A call or future is disposed **only** when the guest discards it. Values delivered to the
  guest are never disposed: from then on, the guest owns them.
- A promise may be disposed *after* it settled, if the guest discarded it before the settled
  value was delivered. In that case the value will never reach the guest, and the host is
  responsible for releasing it.
- Disposal is called at most once, asynchronously (never from inside the canonical built-in
  the guest called). The guest does not wait for it.
- Fulfilling or rejecting a promise after disposal (for example with an `AbortError`) is
  ignored, and does not trap the component.
- Errors thrown (or rejections returned) during disposal are reported with `console.error`
  and do not affect the guest.
- Providers that ignore disposal, or never settle, do not block the guest.

## Limitations

- Only async-lowered calls can be cancelled by a guest. Sync-lowered calls to async imports,
  and synchronous imports suspended via JSPI, give the guest no handle with which to cancel the
  individual call, so they are never disposed.
- If a guest cancels an `async` import call whose result would have contained a future or
  stream, only the returned promise is disposed, as the future or stream was never created.
- Cancellation of the enclosing task, instance teardown, and the lifetime of resources already
  delivered to the guest are not covered by this mechanism.

[mdn-async-dispose]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol/asyncDispose
[mdn-dispose]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol/dispose
