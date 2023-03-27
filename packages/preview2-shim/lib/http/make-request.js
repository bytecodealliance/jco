import { runAsWorker } from "./synckit/index.js";

/**
 * @param {import("../types/imports/types").Request} req
 * @returns {Promise<string>}
 */
async function makeRequest(req) {
  try {
    let headers = new Headers(req.headers);
    const resp = await fetch(req.uri, {
      method: req.method.toString(),
      headers,
      body: req.body && req.body.length > 0 ? req.body : undefined,
    });
    let arrayBuffer = await resp.arrayBuffer();
    return JSON.stringify({
      status: resp.status,
      headers: Array.from(resp.headers.entries()),
      body:
        arrayBuffer.byteLength > 0
          ? Buffer.from(arrayBuffer).toString("base64")
          : undefined,
    });
  } catch (err) {
    return err.message;
  }
}

runAsWorker(makeRequest);
