import { Todo } from "../../common/errors.js";
import type {
  Fields as FieldsT,
  Request as RequestT,
  RequestOptions as RequestOptionsT,
  Response as ResponseT,
  FieldName,
  FieldValue,
  Headers,
  Method,
  Scheme,
  Duration,
  StatusCode,
  Trailers,
  ErrorCode,
  Result,
} from "../../../types/interfaces/wasi-http-types.d.ts";

class Fields implements FieldsT {
  static fromList(entries: Array<[FieldName, FieldValue]>): FieldsT {
    throw new Todo();
  }
  get(name: FieldName): Array<FieldValue> {
    throw new Todo();
  }
  has(name: FieldName): boolean {
    throw new Todo();
  }
  set(name: FieldName, value: Array<FieldValue>): void {
    throw new Todo();
  }
  delete(name: FieldName): void {
    throw new Todo();
  }
  getAndDelete(name: FieldName): Array<FieldValue> {
    throw new Todo();
  }
  append(name: FieldName, value: FieldValue): void {
    throw new Todo();
  }
  copyAll(): Array<[FieldName, FieldValue]> {
    throw new Todo();
  }
  clone(): FieldsT {
    throw new Todo();
  }
}
class Request implements RequestT {
  static new(
    headers: Headers,
    contents: ReadableStream<number> | undefined,
    trailers: Promise<Result<Trailers | undefined, ErrorCode>>,
    options: RequestOptions | undefined,
  ): [Request, Promise<Result<void, ErrorCode>>] {
    throw new Todo();
  }
  getMethod(): Method {
    throw new Todo();
  }
  setMethod(method: Method): void {
    throw new Todo();
  }
  getPathWithQuery(): string | undefined {
    throw new Todo();
  }
  setPathWithQuery(pathWithQuery: string | undefined): void {
    throw new Todo();
  }
  getScheme(): Scheme | undefined {
    throw new Todo();
  }
  setScheme(scheme: Scheme | undefined): void {
    throw new Todo();
  }
  getAuthority(): string | undefined {
    throw new Todo();
  }
  setAuthority(authority: string | undefined): void {
    throw new Todo();
  }
  getOptions(): RequestOptionsT | undefined {
    throw new Todo();
  }
  getHeaders(): Headers {
    throw new Todo();
  }
  static consumeBody(
    this_: Request,
    res: Promise<Result<void, ErrorCode>>,
  ): [ReadableStream<number>, Promise<Result<Trailers | undefined, ErrorCode>>] {
    throw new Todo();
  }
}
class RequestOptions implements RequestOptionsT {
  getConnectTimeout(): Duration | undefined {
    throw new Todo();
  }
  setConnectTimeout(duration: Duration | undefined): void {
    throw new Todo();
  }
  getFirstByteTimeout(): Duration | undefined {
    throw new Todo();
  }
  setFirstByteTimeout(duration: Duration | undefined): void {
    throw new Todo();
  }
  getBetweenBytesTimeout(): Duration | undefined {
    throw new Todo();
  }
  setBetweenBytesTimeout(duration: Duration | undefined): void {
    throw new Todo();
  }
  clone(): RequestOptionsT {
    throw new Todo();
  }
}
class Response implements ResponseT {
  static new(
    headers: Headers,
    contents: ReadableStream<number> | undefined,
    trailers: Promise<Result<Trailers | undefined, ErrorCode>>,
  ): [Response, Promise<Result<void, ErrorCode>>] {
    throw new Todo();
  }
  getStatusCode(): StatusCode {
    throw new Todo();
  }
  setStatusCode(statusCode: StatusCode): void {
    throw new Todo();
  }
  getHeaders(): Headers {
    throw new Todo();
  }
  static consumeBody(
    this_: Response,
    res: Promise<Result<void, ErrorCode>>,
  ): [ReadableStream<number>, Promise<Result<Trailers | undefined, ErrorCode>>] {
    throw new Todo();
  }
}

export default {
  Fields,
  Request,
  RequestOptions,
  Response,
} satisfies typeof import("../../../types/interfaces/wasi-http-types.d.ts");
export type * from "../../../types/interfaces/wasi-http-types.d.ts";
