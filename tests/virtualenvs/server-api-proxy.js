import { _appendEnv } from "@bytecodealliance/preview2-shim/cli";
import { createIncomingServer } from "../server/index.js";

const authority = await createIncomingServer('api_proxy');

_appendEnv({
  "HANDLER_API_PROXY": authority
});
