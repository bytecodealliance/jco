/// <reference path="./wasi-http-types.d.ts" />
declare module 'wasi:http/incoming-handler@0.2.6' {
  /**
   * This function is invoked with an incoming HTTP Request, and a resource
   * `response-outparam` which provides the capability to reply with an HTTP
   * Response. The response is sent by calling the `response-outparam.set`
   * method, which allows execution to continue after the response has been
   * sent. This enables both streaming to the response body, and performing other
   * work.
   * 
   * The implementor of this function must write a response to the
   * `response-outparam` before returning, or else the caller will respond
   * with an error on its behalf.
   *
   * @since 0.2.0
   */
  export function handle(request: IncomingRequest, responseOut: ResponseOutparam): void;
  /**
   * @since 0.2.0
   */
  export type IncomingRequest = import('wasi:http/types@0.2.6').IncomingRequest;
  /**
   * @since 0.2.0
   */
  export type ResponseOutparam = import('wasi:http/types@0.2.6').ResponseOutparam;
}
