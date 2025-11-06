const ENCODER = new TextEncoder();

/**
 * NOTE: these *must* be type only imports to avoid creating an actual dependency
 * When building against newer WIT interfaces (e.g. 0.2.6)
 */
import type { ResponseOutparam, OutgoingResponse, OutgoingBody, Fields, FieldValue } from "wasi:http/types@0.2.3";

interface GenWriteWebResponseFnArgs {
    types: {
        OutgoingResponse: typeof OutgoingResponse,
        Fields: typeof Fields,
        OutgoingBody: typeof OutgoingBody,
        ResponseOutparam: typeof ResponseOutparam,
    }
}

/**
 * Generates a function that can be used to read 0.2.x WASI HTTP requests
 * and convert them into web `Request`s
 *
 * Types in this function are left largely as `any` since attempting to
 * enumerate the overlap of 0.2.x APIs that this function depends on manually
 * is somewhat tedious.
 *
 */
export function genWriteWebResponseFn(args: GenWriteWebResponseFnArgs) {
    const { types: { OutgoingResponse, Fields, OutgoingBody, ResponseOutparam } } = args;

    return async function writeWebResponse(resp: Response, outgoingWasiResp: ResponseOutparam): Promise<void> {
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
            const reader = resp.body.getReader();

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
                    let pendingAmt: number;
                    if (remaining <= bytesAllowedRaw) {
                        pendingAmt = chunk.length;
                    } else if (remaining > bytesAllowedRaw) {
                        if (bytesAllowedRaw > BigInt(Number.MAX_SAFE_INTEGER)) {
                            throw new Error("check-write with values greater than u32s not yet supported");
                        }
                        pendingAmt = Number(bytesAllowedRaw);
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

        // Set the response
        ResponseOutparam.set(outgoingWasiResp, {
            tag: 'ok',
            val: outgoingResponse,
        });
    }
}
