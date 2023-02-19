import { UnexpectedError } from "../http/error.js";

/**
 * @param {import("../types/wasi-http").Request} req
 * @returns {string}
 */
export function send(req) {
  console.log(`[http] Send (browser) ${req.uri}`);
  try {
    const xhr = new XMLHttpRequest();
    xhr.open(req.method.toString(), req.uri, false);
    xhr.responseType = "arraybuffer";
    for (let [name, value] of req.headers) {
      xhr.setRequestHeader(name, value);
    }
    xhr.send(req.body.length > 0 ? req.body : null);
    return {
      status: xhr.status,
      headers: xhr
        .getAllResponseHeaders()
        .trim()
        .split(/[\r\n]+/),
      body: xhr.response.byteLength > 0 ? xhr.response : undefined,
    };
  } catch (err) {
    throw new UnexpectedError(err.message);
  }
}
