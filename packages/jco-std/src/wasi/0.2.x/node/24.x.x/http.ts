import * as host from "jco:node/http@0.1.0";

import { createHttp } from "./http/core.js";
import { createDirectHttpTransport } from "./http/transports/direct.js";

const http = createHttp(createDirectHttpTransport(host));

export const Agent = http.Agent;
export const ClientRequest = http.ClientRequest;
export const CloseEvent = http.CloseEvent;
export const IncomingMessage = http.IncomingMessage;
export const METHODS = http.METHODS;
export const MessageEvent = http.MessageEvent;
export const OutgoingMessage = http.OutgoingMessage;
export const STATUS_CODES = http.STATUS_CODES;
export const Server = http.Server;
export const ServerResponse = http.ServerResponse;
export const WebSocket = http.WebSocket;
export const _connectionListener = http._connectionListener;
export const createServer = http.createServer;
export const get = http.get;
export const globalAgent = http.globalAgent;
export const maxHeaderSize = http.maxHeaderSize;
export const request = http.request;
export const setGlobalProxyFromEnv = http.setGlobalProxyFromEnv;
export const setMaxIdleHTTPParsers = http.setMaxIdleHTTPParsers;
export const validateHeaderName = http.validateHeaderName;
export const validateHeaderValue = http.validateHeaderValue;

export default http;
