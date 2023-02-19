import { createSyncFn } from "synckit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UnexpectedError } from "../http/error.js";

export function send(req) {
  console.log(`[http] Send (nodejs) ${req.uri}`);
  const dirname = path.dirname(fileURLToPath(import.meta.url));
  const syncFn = createSyncFn(path.resolve(dirname, "../http/make-request.js"));
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
