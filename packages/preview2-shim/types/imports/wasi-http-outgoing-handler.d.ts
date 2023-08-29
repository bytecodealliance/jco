export namespace WasiHttpOutgoingHandler {
  export function handle(request: OutgoingRequest, options: RequestOptions | null): FutureIncomingResponse;
}
import type { OutgoingRequest } from '../imports/wasi-http-types';
export { OutgoingRequest };
import type { RequestOptions } from '../imports/wasi-http-types';
export { RequestOptions };
import type { FutureIncomingResponse } from '../imports/wasi-http-types';
export { FutureIncomingResponse };
