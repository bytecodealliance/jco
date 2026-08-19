# Preview 3 Streams and Backpressure

Preview 3 WIT `stream<T>` values are asynchronous sequences of elements.

Jco accepts JS `AsyncIterable`s for host-provided readable streams, including
`ReadableStream` and async generators (which may be manually constructed). Numeric
chunks such as `Uint8Array` are expanded into their individual elements.

Items passed through iterables are elements, *not* chunks.

A component may do many things that are not quite similar to how async iterables work
natively in JS:

* Consume part of a chunk
* Combine several chunks in one read
* Issue a zero-length readiness read
* Cancel an in-progress read.

Code that depends on one JavaScript chunk corresponding to one
component read has to be written with this in mind.

## Backpressure is not an acknowledgement

Backpressure limits how far a producer should run ahead of a consumer. It does
not prove that the component has processed a value (i.e. if you are performing an
operation on stream elements, it does not mean that the component has *performed*
the relevant operation).

In particular:

- `ReadableStreamDefaultController.enqueue()` returns immediately.
- `WritableStreamDefaultWriter.ready` means the stream can accept more data.
- A resolved `WritableStreamDefaultWriter.write()` means the Web Stream
  accepted the chunk according to its queuing strategy; it is not an
  application-level acknowledgement from the component.
- Runtime readiness probes may request data before the component performs its
  next non-empty read.

**If the producer needs delivery confirmation, this should be expressed in WIT,
rather than inferring it from Stream object backpressure.**

Use a bounded producer and wait for backpressure before producing more data:

```js
const transform = new TransformStream(
    undefined,
    { highWaterMark: 1 },
    { highWaterMark: 1 },
);
const writer = transform.writable.getWriter();

async function produce(source) {
    try {
        for await (const chunk of source) {
            if (writer.desiredSize !== null && writer.desiredSize <= 0) {
                await writer.ready;
            }
            await writer.write(chunk);
        }
        await writer.close();
    } catch (error) {
        await writer.abort(error);
        throw error;
    }
}

// Pass transform.readable as the JS representation of stream<u8>.
```

Try to avoid enqueuing unbounded inputs eagerly, and treat an enqueued typed array as
immutable; mutating or reusing its storage while it is buffered can change data
that has not crossed the component boundary yet.

## Cancellation can race completion

When `stream<t>`s are cancelled, in-progress copies are automatically resolved.
Data can become available between the cancellation request and cancellation
completion, which means the result may therefore report either:

1. `cancelled` with no progress; or
2. `completed` with the number of elements copied before cancellation ocurred

Regardless of which occurs, the stream remains usable, it's up to the producer
to retain retain values that were fetched from its source but were not copied,
preserve their order, and offer them to the next read.

The producer *must not* start a second write against a stream end that already
has a copy in progress.

This means that for custom async iterators, you should likely implement cleanup
with `return()` or a generator `finally` block.

Also, cancellation of one component read does not necessarily mean that the entire
WIT stream was dropped:

```js
async function* byteStream(source) {
    try {
        for await (const chunk of source) {
            yield chunk;
        }
    } finally {
        await source.close();
    }
}
```

## Zero-length reads are readiness probes

A component can read zero elements to wait until data or end-of-stream is
observable without consuming an element.

Jco may pull one host chunk to answer that readiness query, but the values
must remain available for a later non-empty read.

This has two practical consequences:

1. Producing a chunk does not imply that any of its elements were consumed.
2. A source with side effects should perform them when producing the value, not
   when assuming the component received it.

When testing a host stream you should generally include:
- Delayed production
- Chunks larger than the guest read buffer
- Repeated read cancellation
- Zero-length readiness reads
- An end-to-end ordering check.

Timing-only assertions are not a good idea, and you should generally make sure to
interact with the stream directly.
