import { OutgoingBody, ResponseOutparam, Fields, OutgoingResponse, FieldValue } from 'wasi:http/types@0.2.3';

const ENCODER = new TextEncoder();

/** Write a Web `Response` into a `wasi:http@0.2.x#outgoing-response` */
export async function writeWebResponse(resp: Response, outgoingWasiResp: ResponseOutparam) {
    // Build headers
    const fields: [string, FieldValue][] = [];
    for (const [k,v] of [...resp.headers.entries()]) {
        fields.push([k.toString(), ENCODER.encode(v)]);
    }
    const headers = Fields.fromList(fields);
    const outgoingResponse = new OutgoingResponse(headers);

    // Set status
    const status = resp.status;
    outgoingResponse.setStatusCode(status);

    // Build the outgoing response body
    const outgoingBody = outgoingResponse.body();
    {
        // Create a stream for the response body
        const outputStream = outgoingBody.write();
        if (resp.body === null) {
            throw new Error("unexpectedly missing resp.body");
        }
        const pollable = outputStream.subscribe();

        // Create a reader for the body we'll be writing out
        const reader = await resp.body.getReader();

        while (true) {
            const { value: chunk, done } = await reader.read();
            if (done) { break; }

            if (chunk.length === 0) {
                continue;
            }

            let written = 0n;
            while (written < chunk.length) {
                // Wait until output stream is ready
                if (!pollable.ready()) {
                    pollable.block();
                }

                // Find out how much we are allowed to write
                const bytesAllowedRaw = outputStream.checkWrite();

                // If we can't write as much as we want, we must
                const remaining = BigInt(chunk.length) - written;
                let pendingAmt;
                if (remaining <= bytesAllowedRaw) {
                    pendingAmt = chunk.length;
                } else if (remaining > bytesAllowedRaw) {
                    pendingAmt = bytesAllowedRaw;
                }

                // Write a view of the chunk in
                const view = new Uint8Array(chunk, Number(written), pendingAmt);
                outputStream.write(view);

                written += BigInt(pendingAmt);
            }
        }

        // Clean up pollable & stream
        pollable[Symbol.dispose]();
        outputStream[Symbol.dispose]();
    }

    // Set the outgoing response body w/ no trailers
    OutgoingBody.finish(outgoingBody, undefined);

    // Set the response outparam
    ResponseOutparam.set(outgoingWasiResp, {
        tag: 'ok',
        val: outgoingResponse,
    });
}
