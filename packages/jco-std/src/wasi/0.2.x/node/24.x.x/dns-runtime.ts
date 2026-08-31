import { query } from "jco:node/dns@0.1.0";

import { createDns } from "./dns/core.js";

export const dns = createDns({ query });
