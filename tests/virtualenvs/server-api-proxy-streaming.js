import { _appendEnv } from "@bytecodealliance/preview2-shim/cli";
import { createIncomingServer } from "../server/index.js";

const authority = await createIncomingServer('api_proxy_streaming');

_appendEnv({
  "HANDLER_API_PROXY_STREAMING": authority
});
