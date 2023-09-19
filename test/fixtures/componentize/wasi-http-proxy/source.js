import { handle } from 'wasi:http/outgoing-handler';
import {
  dropFields,
  dropFutureIncomingResponse,
  dropIncomingResponse,
  dropOutgoingRequest,
  fieldsEntries,
  futureIncomingResponseGet,
  incomingResponseConsume,
  incomingResponseHeaders,
  incomingResponseStatus,
  newFields,
  newOutgoingRequest,
  outgoingRequestWrite,
} from 'wasi:http/types';
import { dropPollable } from 'wasi:poll/poll';
import {
  dropInputStream,
  read as readStream,
  subscribeToInputStream,
} from 'wasi:io/streams';

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

export const commands = {
  getExample: () => {
    try {
      let incomingResponse;
      {
        const headers = newFields([
          ['User-agent', 'WASI-HTTP/0.0.1'],
          ['Content-type', 'application/json'],
        ]);

        const request = newOutgoingRequest(
          {
            tag: 'get',
          },
          '/api/example-get',
          {
            tag: 'HTTP',
          },
          'localhost:8080',
          headers
        );
        console.warn('request id', request);

        const body = outgoingRequestWrite(request);
        console.warn('request body id', body);

        const futureResponse = handle(request, undefined);
        incomingResponse = futureIncomingResponseGet(futureResponse).val;
        console.warn('incoming response id', incomingResponse);

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

      const [buf, _] = readStream(bodyStream, 50n);
      const body = buf.length > 0 ? new TextDecoder().decode(buf) : undefined;

      dropPollable(inputStreamPollable);
      dropInputStream(bodyStream);
      dropIncomingResponse(incomingResponse);

      return JSON.stringify({
        status,
        headers,
        body,
      });
    } catch (err) {
      console.error(err);
      throw new GenericError(err.message);
    }
  },
};

export const incomingHandler = {
  handle(_request, _response) {
    throw new Error('not implemented');
  },
};
