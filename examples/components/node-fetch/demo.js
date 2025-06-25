import { argv } from "node:process";
import { URL } from "node:url";

import { simpleRequest } from "./dist/transpiled/component.js";

const DEFAULT_URL = "https://jsonplaceholder.typicode.com/posts/1";

async function main() {
  // NOTE: argv should look like [path/to/node, path/to/script, ...args]
  let requestURL = DEFAULT_URL;
  if (argv[2]) {
    try {
      console.log(`parsing URL: [${argv[2]}]...`);
      requestURL = new URL(argv[1]).toString();
    } catch (err) {
      console.log(`ERROR: failed to build URL from argument [${argv[1]}]`);
      throw err;
    }
  }

  // NOTE: in the case of a missing/undefined requestURL, the component will use the default
  const { url, responseJson } = simpleRequest.getJson(requestURL);
  console.log(`Performed HTTP GET request [${url}]`);
  console.log({
    url,
    responseJson: JSON.parse(responseJson),
  });
}

await main();
