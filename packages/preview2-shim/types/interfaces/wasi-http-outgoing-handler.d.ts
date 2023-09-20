export namespace WasiHttpOutgoingHandler {
  export function handle(request: OutgoingRequest, options: RequestOptions | undefined): FutureIncomingResponse;
}
import type { OutgoingRequest } from '../interfaces/wasi-http-types';
export { OutgoingRequest };
import type { RequestOptions } from '../interfaces/wasi-http-types';
export { RequestOptions };
import type { FutureIncomingResponse } from '../interfaces/wasi-http-types';
export { FutureIncomingResponse };
