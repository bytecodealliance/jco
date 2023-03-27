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
    const requestHeaders = new Headers(req.headers);
    for (let [name, value] of requestHeaders.entries()) {
      if (name !== "user-agent" && name !== "host") {
        xhr.setRequestHeader(name, value);
      }
    }
    xhr.send(req.body && req.body.length > 0 ? req.body : null);
    const body = xhr.response ? new TextEncoder().encode(xhr.response) : undefined;
    const headers = [];
    xhr.getAllResponseHeaders().trim().split(/[\r\n]+/).forEach((line) => {
      var parts = line.split(': ');
      var key = parts.shift();
      var value = parts.join(': ');
      headers.push([key, value]);
    });
    return {
      status: xhr.status,
      headers,
      body,
    };
  } catch (err) {
    throw new UnexpectedError(err.message);
  }
}
