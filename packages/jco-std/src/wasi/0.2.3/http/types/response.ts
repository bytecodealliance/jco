import { OutgoingBody, ResponseOutparam, Fields, OutgoingResponse } from 'wasi:http/types@0.2.3';
import { genWriteWebResponseFn } from '../../../0.2.x/http/types/response.js';

/** Write a Web `Response` into a `wasi:http@0.2.x#outgoing-response` */
export async function writeWebResponse(resp: Response, outgoingWasiResp: ResponseOutparam) {
    const f = genWriteWebResponseFn({
        types: {
            OutgoingResponse,
            Fields,
            OutgoingBody,
            ResponseOutparam,
        },
    });
    await f(resp, outgoingWasiResp);
}
