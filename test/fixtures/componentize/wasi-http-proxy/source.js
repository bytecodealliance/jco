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
  checkWrite,
  dropInputStream,
  flush,
  read as readStream,
  subscribeToInputStream,
  write as writeStream,
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
      const headers = newFields([
        ['User-agent', 'WASI-HTTP/0.0.1'],
        ['Content-type', 'application/json'],
      ]);

      const request = newOutgoingRequest(
        method,
        pathWithQuery,
        scheme,
        authority,
        headers
      );

      if (body) {
        const body = outgoingRequestWrite(request);
        const outputStreamPollable = subscribeToInputStream(body);
        let buf = new TextEncoder().encode(JSON.stringify({ key: 'value' }));
  
        while (buf.byteLength > 0) {
          // pollOneoff(new Uint32Array([outputStreamPollable]));
  
          const permit = Number(checkWrite(body));

          const len = Math.min(buf.byteLength, permit);
          const chunk = buf.slice(0, len);
          if (len < buf.byteLength) {
            buf = buf.slice(len + 1, buf.byteLength);
          } else {
            buf = new Uint8Array();
          }
          console.warn("[guest] buffer length", buf.length);
  
          writeStream(body, chunk);
        }
  
        flush(body);
        // pollOneoff(new Uint32Array([outputStreamPollable]));
        checkWrite(body);
    
        dropPollable(outputStreamPollable);  
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

    const [buf, _] = readStream(bodyStream, 50n);
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
