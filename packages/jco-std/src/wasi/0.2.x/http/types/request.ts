import { ensureGlobalReadableStream, ensureGlobalRequest } from "../../../globals.js";
import { wasiHTTPMethodToString, requestShouldHaveBody } from "../../../0.2.x/http/index.js";
import { DEFAULT_INCOMING_BODY_READ_MAX_BYTES } from "../../../constants.js";

/**
 * NOTE: these *must* be type only imports to avoid creating an actual dependency
 * When building against newer WIT interfaces (e.g. 0.2.6)
 */
import type { IncomingRequest, IncomingBody } from "wasi:http/types@0.2.3";
import type { InputStream, Pollable } from "wasi:io/streams@0.2.3";

/**
 * Generates a function that can be used to read 0.2.x WASI HTTP requests
 * and convert them into web `Request`s
 *
 * Types in this function are left largely as `any` since attempting to
 * enumerate the overlap of 0.2.x APIs that this function depends on manually
 * is somewhat tedious.
 *
 */
export function genReadWASIRequestFn(incomingBodyTy: typeof IncomingBody) {
    return async function readWASIRequest(wasiIncomingRequest: IncomingRequest): Promise<Request> {
        if (!wasiIncomingRequest) {
            throw new TypeError('WASI incoming request not provided');
        }
        const method = wasiHTTPMethodToString(wasiIncomingRequest.method());
        const pathWithQuery = wasiIncomingRequest.pathWithQuery();

        const schemeRaw = wasiIncomingRequest.scheme();
        let scheme;
        switch (schemeRaw.tag) {
            case 'HTTP':
                scheme = 'http'
                break;
            case 'HTTPS':
                scheme = 'https'
                break;
            default:
                throw new Error(`unexpected scheme [${schemeRaw.tag}]`);
        }

        const authority = wasiIncomingRequest.authority();
        const decoder = new TextDecoder('utf-8');
        const headers = Object.fromEntries(
            wasiIncomingRequest.headers().entries().map(([k,valueBytes]) => {
                return [k, decoder.decode(valueBytes)];
            })
        );
        const Request = ensureGlobalRequest();
        const ReadableStream = ensureGlobalReadableStream();

        let incomingBody: IncomingBody;
        let incomingBodyStream: InputStream;
        let incomingBodyPollable: Pollable;

        let body: ReadableStream;
        if (requestShouldHaveBody({ method })) {
            body = new ReadableStream({
                start(controller) {
                    if (!incomingBody) {
                        incomingBody = wasiIncomingRequest.consume();
                        incomingBodyStream = incomingBody.stream();
                        incomingBodyPollable = incomingBodyStream.subscribe();
                    }
                },

                pull(controller) {
                    // Read all information coming from the request
                    while (true) {
                        // Wait until the pollable is ready
                        if (!incomingBodyPollable.ready()) {
                            incomingBodyPollable.block();
                        }

                        try {
                            const bytes = incomingBodyStream.read(DEFAULT_INCOMING_BODY_READ_MAX_BYTES);
                            if (bytes.length === 0) {
                                break;
                            }
                            controller.enqueue(bytes);
                        } catch (err) {
                            if (err.payload.tag === 'closed') { break; }
                            throw err;
                        }
                    }

                    // Once information has all been read we can clean up
                    incomingBodyPollable[Symbol.dispose]();
                    incomingBodyStream[Symbol.dispose]();

                    // Here we finish with the appropriate IncomingBody static method
                    // (this differs by WIT iface version)
                    incomingBodyTy.finish(incomingBody);

                    wasiIncomingRequest[Symbol.dispose]();
                    controller.close();
                },
            });

        }

        const url = `${scheme}://${authority}${pathWithQuery}`;
        const req = new Request(url, {
            method,
            headers,
            body,
        });

        return req;
    }
}
