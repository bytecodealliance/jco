import { UnexpectedError } from "../http/error.js";

/**
 * @param {import("../types/imports/types").Request} req
 * @returns {string}
 */
export function send(req) {
  console.log(`[http] Send (browser) ${req.uri}`);
  try {
    const xhr = new XMLHttpRequest();
    xhr.open(req.method.toString(), req.uri, false);
    for (let [name, value] of req.headers) {
      if (name !== "user-agent") {
        xhr.setRequestHeader(name, value);
      }
    }
    xhr.send(req.body.length > 0 ? req.body : null);
    const body = xhr.response ? new TextEncoder().encode(xhr.response) : undefined;
    return {
      status: xhr.status,
      headers: xhr
        .getAllResponseHeaders()
        .trim()
        .split(/[\r\n]+/),
      body,
    };
  } catch (err) {
    throw new UnexpectedError(err.message);
  }
}
