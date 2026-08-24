import { _appendEnv } from "@bytecodealliance/preview2-shim/cli";

import server from '../server/index.mjs';
const { createIncomingServer } = server;

const authority1 = await createIncomingServer('api_proxy_streaming');
const authority2 = await createIncomingServer('api_proxy_streaming');

_appendEnv({
  "HANDLER_API_PROXY_STREAMING1": authority1,
  "HANDLER_API_PROXY_STREAMING2": authority2
});
