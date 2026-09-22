export const echo = {
    async echo(messages) {
        let count = 0;
        let completed = false;

        async function* echoMessages() {
            for await (const message of messages) {
                count += 1;
                yield message;
            }
            // Normal exhaustion reaches this line; cancellation closes the generator before it.
            completed = true;
        }

        // componentize-qjs injects globalThis.wit with Stream/Future factories and .from() adapters.
        // Selectors exist only for declared WIT types; inspect wit.Stream.types / wit.Future.types.
        //
        // Our aliases also provide wit.Stream.MESSAGE_STREAM and wit.Future.COMPLETION.
        // With one type per factory the selector is inferred; otherwise pass it as .from()'s second argument.
        //
        // See: https://github.com/andreiltd/componentize-qjs/blob/main/docs/runtime-intrinsics.md#globalthiswit--public-streamfuture-api
        const output = wit.Stream.from(echoMessages());

        // Map the producer's completion, after input cleanup, to a WIT future carrying its final status.
        const completion = wit.Future.from(
            output.completion.then(() => (completed ? { tag: 'ok', val: count } : { tag: 'err', val: 'cancelled' })),
        );

        // The adapters own and drop the writers; only readable handles transfer to the host.
        // Do not await their completion here: writes can block until the host reads.
        return {
            messages: output.readable,
            completion: completion.readable,
        };
    },
};
