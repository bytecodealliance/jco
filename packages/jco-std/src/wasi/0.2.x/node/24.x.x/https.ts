import * as host from "jco:node/http@0.1.0";

import { createDirectHttpImplementation } from "./http/impl/direct.js";
import { createHttps } from "./https/core.js";

const https = createHttps(createDirectHttpImplementation(host));

export const Agent = https.Agent;
export const Server = https.Server;
export const createServer = https.createServer;
export const get = https.get;
export const globalAgent = https.globalAgent;
export const request = https.request;

export default https;
