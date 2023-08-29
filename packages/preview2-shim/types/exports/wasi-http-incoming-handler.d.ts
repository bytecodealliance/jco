export namespace WasiHttpIncomingHandler {
  export function handle(request: IncomingRequest, responseOut: ResponseOutparam): void;
}
import type { IncomingRequest } from '../exports/wasi-http-types';
export { IncomingRequest };
import type { ResponseOutparam } from '../exports/wasi-http-types';
export { ResponseOutparam };
