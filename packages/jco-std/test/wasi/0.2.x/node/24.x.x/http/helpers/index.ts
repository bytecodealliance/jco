import { createHttp } from "../../../../../../../src/wasi/0.2.x/node/24.x.x/http/core.js";
import type {
  HttpTransport,
  HttpTransportRequest,
  HttpTransportResponse,
} from "../../../../../../../src/wasi/0.2.x/node/24.x.x/http/types.js";

const encoder = new TextEncoder();

export function response(body = "response body"): HttpTransportResponse {
  return {
    statusCode: 200,
    statusMessage: "OK",
    httpVersion: "1.1",
    headers: [
      { name: "Content-Type", value: encoder.encode("text/plain") },
      { name: "Set-Cookie", value: encoder.encode("first=1") },
      { name: "Set-Cookie", value: encoder.encode("second=2") },
    ],
    body: encoder.encode(body),
  };
}

export function recordingTransport(result = response()): {
  http: ReturnType<typeof createHttp>;
  requests: HttpTransportRequest[];
  transport: HttpTransport;
} {
  const requests: HttpTransportRequest[] = [];
  const transport: HttpTransport = {
    request(request) {
      requests.push(request);
      return result;
    },
  };
  return { http: createHttp(transport), requests, transport };
}

export function nextTurn(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
