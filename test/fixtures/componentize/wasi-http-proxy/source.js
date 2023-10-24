import { handle } from 'wasi:http/outgoing-handler@0.2.0-rc-2023-11-05';
import {
  Fields,
  IncomingRequest,
  IncomingResponse,
  ResponseOutparam,
  OutgoingRequest,
  OutgoingResponse,
  FutureIncomingResponse,
  IncomingBody,
  FutureTrailers,
} from 'wasi:http/types@0.2.0-rc-2023-11-05';

class GenericError extends Error {
  payload;
  constructor(message) {
    super(message);
    this.payload = {
      tag: "generic",
      val: message,
    };
  }
}

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
      const headers = new Fields([
        ['User-agent', 'WASI-HTTP/0.0.1'],
        ['Content-type', 'application/json'],
      ]);

      const request = new OutgoingRequest(
        method,
        pathWithQuery,
        scheme,
        authority,
        headers
      );

      if (body) {
        const bodyStream = outgoingRequestWrite(request);
        write(bodyStream, new TextEncoder().encode(body));
        flush(bodyStream);
        finishOutgoingStream(bodyStream);
        dropOutputStream(bodyStream);
      }

      const futureResponse = handle(request, undefined);
      incomingResponse = futureIncomingResponseGet(futureResponse).val;
      dropOutgoingRequest(request);
      dropFutureIncomingResponse(futureResponse);
    }

    const status = incomingResponseStatus(incomingResponse);

    const headersHandle = incomingResponseHeaders(incomingResponse);

    const responseHeaders = fieldsEntries(headersHandle);

    const decoder = new TextDecoder();
    const headers = responseHeaders.map(([k, v]) => [k, decoder.decode(v)]);
    dropFields(headersHandle);

    const bodyStream = incomingResponseConsume(incomingResponse);
    const inputStreamPollable = subscribeToInputStream(bodyStream);

    const [buf, _] = read(bodyStream, 50n);
    const responseBody = buf.length > 0 ? new TextDecoder().decode(buf) : undefined;

    dropPollable(inputStreamPollable);
    dropInputStream(bodyStream);
    dropIncomingResponse(incomingResponse);

    return JSON.stringify({
      status,
      headers,
      body: responseBody,
    });
  } catch (err) {
    console.error(err);
    throw new GenericError(err.message);
  }
}

export const commands = {
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
