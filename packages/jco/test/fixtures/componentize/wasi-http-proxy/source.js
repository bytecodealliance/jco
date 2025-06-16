import { handle } from 'wasi:http/outgoing-handler@0.2.3';
import { Fields, OutgoingRequest, OutgoingBody } from 'wasi:http/types@0.2.3';
import { getArguments } from 'wasi:cli/environment@0.2.3';

const sendRequest = (method, scheme, authority, pathWithQuery, body) => {
    try {
        let incomingResponse;
        {
            let encoder = new TextEncoder();

            const req = new OutgoingRequest(
                new Fields([
                    ['User-agent', encoder.encode('WASI-HTTP/0.0.1')],
                    ['Content-type', encoder.encode('application/json')],
                ])
            );
            req.setScheme(scheme);
            req.setMethod(method);
            req.setPathWithQuery(pathWithQuery);
            req.setAuthority(authority);

            if (body) {
                const outgoingBody = req.body();
                {
                    const bodyStream = outgoingBody.write();
                    bodyStream.blockingWriteAndFlush(encoder.encode(body));
                }
                // TODO: we should explicitly drop the bodyStream here
                //       when we have support for Symbol.dispose
                OutgoingBody.finish(outgoingBody);
            }

            const futureIncomingResponse = handle(req);
            futureIncomingResponse.subscribe().block();
            incomingResponse = futureIncomingResponse.get().val.val;
        }

        const status = incomingResponse.status();
        const responseHeaders = incomingResponse.headers().entries();

        const decoder = new TextDecoder();
        const headers = responseHeaders.map(([k, v]) => [k, decoder.decode(v)]);

        let responseBody;
        const incomingBody = incomingResponse.consume();
        {
            const bodyStream = incomingBody.stream();
            bodyStream.subscribe().block();
            const buf = bodyStream.read(50n);
            responseBody =
                buf.length > 0 ? new TextDecoder().decode(buf) : undefined;
        }

        return JSON.stringify({
            status,
            headers,
            body: responseBody,
        });
    } catch (err) {
        throw new Error(err);
    }
};

export const commands = {
    Error,
    getExample: () => {
        // Pull in a dynamic host port via the command line arguments
        const port = parseInt(
            getArguments()
                .filter((s) => s.startsWith('--test-port='))
                .map((s) => s.slice(12))[0]
        );
        return sendRequest(
            {
                tag: 'get',
            },
            {
                tag: 'HTTP',
            },
            `localhost:${port}`,
            '/api/examples'
        );
    },
    postExample: () => {
        // Pull in a dynamic host port via the command line arguments
        const port = parseInt(
            getArguments()
                .filter((s) => s.startsWith('--test-port='))
                .map((s) => s.slice(12))[0]
        );
        return sendRequest(
            {
                tag: 'post',
            },
            {
                tag: 'HTTP',
            },
            `localhost:${port}`,
            '/api/examples',
            JSON.stringify({ key: 'value' })
        );
    },
};

export const incomingHandler = {
    handle(_request, _response) {
        throw new Error('not implemented');
    },
};
