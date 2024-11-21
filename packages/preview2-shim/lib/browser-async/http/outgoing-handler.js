// wasi:http/outgoing-handler@0.2.0 interface

import { FutureIncomingResponse } from "./types.js";

export const handle = (request, _options) => {
  return new FutureIncomingResponse(request);
};
