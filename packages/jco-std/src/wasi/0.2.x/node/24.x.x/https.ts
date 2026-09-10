import { httpGuestCallbacks } from "./http/guest-callbacks.js";
import * as tlsHost from "jco:node/tls@0.1.0";
import * as host from "jco:node/http@0.1.0";

import { createDirectHttpImplementation } from "./http/impl/direct.js";
import { createHttps } from "./https/core.js";

const implementation = createDirectHttpImplementation(host, tlsHost, httpGuestCallbacks);
const https = createHttps(implementation);
export const httpsCallbacks = implementation.httpCallbacks;

export const Agent = https.Agent;
export const Server = https.Server;
export const createServer = https.createServer;
export const get = https.get;
export const globalAgent = https.globalAgent;
export const request = https.request;

export default https;
