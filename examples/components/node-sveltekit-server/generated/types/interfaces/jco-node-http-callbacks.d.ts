/** @module Interface jco:node/http-callbacks@0.1.0 **/
/**
 * Redeem a registration once. The host owns the returned listener until the server closes.
 */
export function takeRequestListener(id: number): Promise<RequestListener | undefined>;
export type Errno = ErrnoNumber | ErrnoSymbolic;
export interface ErrnoNumber {
  tag: 'number',
  val: bigint,
}
export interface ErrnoSymbolic {
  tag: 'symbolic',
  val: string,
}
export interface Error {
  name: string,
  message: string,
  code?: string,
  errno?: Errno,
  syscall?: string,
  hostname?: string,
  address?: string,
  port?: number,
}
export interface Header {
  name: string,
  value: Uint8Array,
}
export interface IncomingRequest {
  method: string,
  url: string,
  httpVersion: string,
  headers: Array<Header>,
  body: Uint8Array,
  remoteAddress?: string,
  remotePort?: number,
}
export interface OutgoingResponse {
  statusCode: number,
  statusMessage: string,
  headers: Array<Header>,
  body: Uint8Array,
}

export class RequestListener {
  /**
   * This type does not have a public constructor.
   */
  private constructor();
  handle(request: IncomingRequest): Promise<OutgoingResponse>;
}
