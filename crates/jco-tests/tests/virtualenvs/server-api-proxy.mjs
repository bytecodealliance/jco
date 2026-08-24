import { _appendEnv } from "@bytecodealliance/preview2-shim/cli";

import server from '../server/index.mjs';
const { createIncomingServer } = server;

const authority = await createIncomingServer('api_proxy');

_appendEnv({
  "HANDLER_API_PROXY": authority
});
