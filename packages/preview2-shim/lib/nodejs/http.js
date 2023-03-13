import { fileURLToPath } from "node:url";
import { UnexpectedError } from "../http/error.js";
import { createSyncFn } from "../http/synckit/index.js";

const workerPath = fileURLToPath(new URL('../http/make-request.js', import.meta.url));

export function send(req) {
  console.log(`[http] Send (nodejs) ${req.uri}`);
  const syncFn = createSyncFn(workerPath);
  let rawResponse = syncFn(req);
  let response = JSON.parse(rawResponse);
  if (response.status) {
    return {
      ...response,
      body: response.body ? Buffer.from(response.body, "base64") : undefined,
    };
  }
  throw new UnexpectedError(response);
}
