import { runAsWorker } from "../synckit/index.js";

/**
 * @param {import("../../types/interfaces/wasi-http-types").Request} req
 * @returns {Promise<string>}
 */
async function makeRequest(req) {
  try {
    let headers = new Headers(req.headers);
    const resp = await fetch(req.uri, {
      method: req.method.toString(),
      headers,
      body: req.body && req.body.length > 0 ? req.body : undefined,
      redirect: "manual",
    });
    let arrayBuffer = await resp.arrayBuffer();
    return JSON.stringify({
      status: resp.status,
      headers: Array.from(resp.headers),
      body:
        arrayBuffer.byteLength > 0
          ? Buffer.from(arrayBuffer).toString("base64")
          : undefined,
    });
  } catch (err) {
    return JSON.stringify({ message: err.toString() });
  }
}

runAsWorker(makeRequest);
