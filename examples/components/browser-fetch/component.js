/**
 * Perform a GET request against a given URL,
 * with the provided name as a way to identify the response
 * coming back.
 *
 * @param {string} rawURL - URL to send the request
 * @param {string} [name] - name of request used for correlation if necessary
 */
async function getJson(rawURL) {
  const url = new URL(rawURL);
  const response = await fetch("https://jsonplaceholder.org/posts/1");
  const responseJson = await response.json();
  return {
    name,
    url: rawURL,
    // NOTE: We have to stringify the JSON response here because WIT does
    // not support the JSON type natively.
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
export const ping = {
  getJson,
};
