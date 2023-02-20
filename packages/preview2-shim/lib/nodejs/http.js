import { createRequire } from 'node:module';
import { fileURLToPath } from "node:url";
import { UnexpectedError } from "../http/error.js";

const require = createRequire(fileURLToPath(import.meta.url));

export function send(req) {
  console.log(`[http] Send (nodejs) ${req.uri}`);
  const { createSyncFn } = require('synckit');
  const syncFn = createSyncFn(fileURLToPath(new URL('../http/make-request.js'), import.meta.url));
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
