const DEFAULT_URL = "https://jsonplaceholder.typicode.com/posts/1";

/**
 * Perform a GET request for JSON against a given URL
 *
 * NOTE: since the input is an option<string>, it is encoded as an optional param
 * https://github.com/bytecodealliance/jco/blob/main/docs/src/wit-type-representations.md
 *
 * @param {string} [rawURL] - URL to send the request
 */
async function getJson(rawURL) {
  const url = new URL(rawURL ?? DEFAULT_URL);
    let responseJson = {};
    const response = await fetch(url);
    responseJson = await response.json();
    return {
        url: rawURL,
        // NOTE: We have to stringify the JSON response here because WIT does
        // not support recursive types natively.
        responseJson: JSON.stringify(responseJson),
    };
}

/**
 * The exports of this JS module implicitly represent the
 * `component` world.
 *
 * All interfaces exported from the component are expected as top level
 * module exports, with relevant functions defined within.
 *
 */
export const simpleRequest = {
  getJson,
};
