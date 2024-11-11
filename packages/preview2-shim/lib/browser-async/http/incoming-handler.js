// wasi:http/incoming-handler@0.2.0 interface

import { IncomingRequest, ResponseOutparam } from "./types.js";

export const handle = async (_request, _responseOut) => {};

//type wasiHandle = (request: IncomingRequest, responseOut: ResponseOutparam) => Promise<void>;

export const getHandler = (handle) => async (req) => {
  const responseOut = new ResponseOutparam();
  await handle(IncomingRequest.fromRequest(req), responseOut);
  const result = await responseOut.promise;
  if (result.tag === "ok") {
    return result.val.toResponse();
  } else {
    throw result; // error
  }
};
