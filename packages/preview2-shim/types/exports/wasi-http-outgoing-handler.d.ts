export namespace WasiHttpOutgoingHandler {
  export function handle(request: OutgoingRequest, options: RequestOptions | null): FutureIncomingResponse;
}
import type { OutgoingRequest } from '../exports/wasi-http-types';
export { OutgoingRequest };
import type { RequestOptions } from '../exports/wasi-http-types';
export { RequestOptions };
import type { FutureIncomingResponse } from '../exports/wasi-http-types';
export { FutureIncomingResponse };
