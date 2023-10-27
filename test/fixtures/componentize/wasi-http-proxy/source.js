import { handle } from 'wasi:http/outgoing-handler@0.2.0-rc-2023-11-05';
import {
  Fields,
  OutgoingRequest,
  OutgoingBody,
} from 'wasi:http/types@0.2.0-rc-2023-11-05';

const sendRequest = (
  method,
  scheme,
  authority,
  pathWithQuery,
  body,
) => {
  try {
    let incomingResponse;
    {
      let encoder = new TextEncoder();

      const request = new OutgoingRequest(
        method,
        pathWithQuery,
        scheme,
        authority,
        new Fields([
          ['User-agent', encoder.encode('WASI-HTTP/0.0.1')],
          ['Content-type', encoder.encode('application/json')],
        ])
      );

      if (body) {
        const outgoingBody = request.write();
        {
          const bodyStream = outgoingBody.write();
          bodyStream.blockingWriteAndFlush(encoder.encode(body));
        }
        // TODO: we should explicitly drop the bodyStream here
        //       when we have support for Symbol.dispose
        OutgoingBody.finish(outgoingBody);
      }

      const futureIncomingResponse = handle(request);
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
      // const bodyStreamPollable = bodyStream.subscribe();
      const buf = bodyStream.read(50n);
      // TODO: actual streaming
      // TODO: explicit drops
      responseBody = buf.length > 0 ? new TextDecoder().decode(buf) : undefined;
    }

    return JSON.stringify({
      status,
      headers,
      body: responseBody,
    });
  } catch (err) {
    throw new Error(err);
  }
}

export const commands = {
  Error,
  getExample: () => {
    return sendRequest(
      {
        tag: 'get',
      },
      {
        tag: 'HTTP',
      },
      'localhost:8080',
      '/api/examples',
    );
  },
  postExample: () => {
    return sendRequest(
      {
        tag: 'post',
      },
      {
        tag: 'HTTP',
      },
      'localhost:8080',
      '/api/examples',
      JSON.stringify({ key: 'value' }),
    );
  },
};

export const incomingHandler = {
  handle(_request, _response) {
    throw new Error('not implemented');
  },
};
