import { createHttp } from "../../../../../../../src/wasi/0.2.x/node/24.x.x/http/core.js";
import type {
  HttpImplementation,
  HttpImplementationRequest,
  HttpImplementationResponse,
} from "../../../../../../../src/wasi/0.2.x/node/24.x.x/http/types.js";

const encoder = new TextEncoder();

export function response(body = "response body"): HttpImplementationResponse {
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

export function recordingImplementation(result = response()): {
  http: ReturnType<typeof createHttp>;
  requests: HttpImplementationRequest[];
  implementation: HttpImplementation;
} {
  const requests: HttpImplementationRequest[] = [];
  const implementation: HttpImplementation = {
    request(request) {
      requests.push(request);
      return result;
    },
  };
  return { http: createHttp(implementation), requests, implementation };
}

export function nextTurn(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
