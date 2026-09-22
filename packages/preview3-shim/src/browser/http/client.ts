import * as preview2Http from "@bytecodealliance/preview2-shim/http";
import type {
  ErrorCode,
  Request as RequestT,
  Response as ResponseT,
  Result,
  Trailers,
} from "../../../types/interfaces/wasi-http-types.d.ts";
import { readableFromPreview2Input, writeToPreview2Output } from "../streams.js";
import { Fields, Request, RequestOptions, Response } from "./types.js";

class HttpError extends Error {
  readonly payload: ErrorCode;

  constructor(payload: ErrorCode, message?: string) {
    super(message ?? payload.tag);
    this.name = "HttpError";
    this.payload = payload;
  }
}

function internalError(error: unknown): ErrorCode {
  return {
    tag: "internal-error",
    val: error instanceof Error ? error.message : String(error),
  };
}

function preview2Options(options: RequestOptions | undefined) {
  if (!options) {
    return undefined;
  }
  const converted = new preview2Http.types.RequestOptions();
  converted.setConnectTimeout(options.getConnectTimeout());
  converted.setFirstByteTimeout(options.getFirstByteTimeout());
  converted.setBetweenBytesTimeout(options.getBetweenBytesTimeout());
  return converted;
}

async function responseTrailers(
  incomingBody: Parameters<typeof preview2Http.types.IncomingBody.finish>[0],
  bodyResult: Promise<Result<void, ErrorCode>>,
): Promise<Result<Trailers | undefined, ErrorCode>> {
  const completed = await bodyResult;
  if (completed.tag === "err") {
    return completed;
  }
  const future = preview2Http.types.IncomingBody.finish(incomingBody);
  await future.subscribe().block();
  const result = future.get();
  if (!result || result.tag === "err") {
    return { tag: "err", val: internalError("response trailers were already consumed") };
  }
  if (result.val.tag === "err") {
    return { tag: "err", val: result.val.val as ErrorCode };
  }
  const fields = result.val.val;
  return {
    tag: "ok",
    val: fields ? new Fields(fields as InstanceType<typeof preview2Http.types.Fields>) : undefined,
  };
}

function trailerEntries(trailers: unknown): Array<[string, Uint8Array]> {
  if ((trailers as { tag?: string })?.tag === "none") {
    return [];
  }
  if ((trailers as { tag?: string })?.tag === "some") {
    return trailerEntries((trailers as { val: unknown }).val);
  }
  if (trailers instanceof Fields) {
    return trailers.copyAll();
  }
  if (Array.isArray(trailers)) {
    return trailers;
  }
  throw new TypeError("trailers must be Fields or a list of entries");
}

async function send(request: RequestT): Promise<ResponseT> {
  if (!(request instanceof Request)) {
    throw new TypeError("request must be a Request resource");
  }

  const outgoing = new preview2Http.types.OutgoingRequest(request.getHeaders()._preview2.clone());
  outgoing.setMethod(request.getMethod());
  outgoing.setScheme(request.getScheme() ?? { tag: "HTTP" });
  outgoing.setAuthority(request.getAuthority());
  outgoing.setPathWithQuery(request.getPathWithQuery());

  let transmit = Promise.resolve<Result<void, ErrorCode>>({ tag: "ok", val: undefined });
  const contents = request._body();
  if (contents) {
    const outgoingBody = outgoing.body();
    transmit = (async () => {
      let result: Result<void, ErrorCode> = { tag: "ok", val: undefined };
      try {
        await writeToPreview2Output(contents, outgoingBody.write());
        const trailers = await request._trailers();
        if (trailers.tag === "err") {
          result = trailers;
        } else if (trailers.val && trailerEntries(trailers.val).length > 0) {
          result = {
            tag: "err",
            val: {
              tag: "internal-error",
              val: "browser Fetch does not support request trailers",
            },
          };
        }
      } catch (error) {
        result = { tag: "err", val: internalError(error) };
      } finally {
        try {
          preview2Http.types.OutgoingBody.finish(outgoingBody, undefined);
        } catch (error) {
          if (result.tag === "ok") {
            result = { tag: "err", val: internalError(error) };
          }
        }
      }
      return result;
    })();
  } else {
    transmit = request
      ._trailers()
      .then((trailers) => (trailers.tag === "err" ? trailers : { tag: "ok", val: undefined }));
  }

  const future = preview2Http.outgoingHandler.handle(
    outgoing,
    preview2Options(request.getOptions()),
  );
  void transmit.then((result) => request._resolve(result));
  try {
    await future.subscribe().block();
    const result = future.get();
    if (!result || result.tag === "err") {
      throw new HttpError(internalError("HTTP response future was already consumed"));
    }
    if (result.val.tag === "err") {
      throw new HttpError(result.val.val as ErrorCode);
    }

    const incoming = result.val.val;
    const headers = new Fields(
      incoming.headers().clone() as InstanceType<typeof preview2Http.types.Fields>,
    );
    const incomingBody = incoming.consume();
    const [contents, bodyResult] = readableFromPreview2Input(incomingBody.stream(), internalError);
    const [response] = Response.new(headers, contents, responseTrailers(incomingBody, bodyResult));
    response.setStatusCode(incoming.status());
    return response;
  } catch (error) {
    const httpError = error instanceof HttpError ? error : new HttpError(internalError(error));
    request._resolve({ tag: "err", val: httpError.payload });
    throw httpError;
  }
}

export default {
  send,
} satisfies typeof import("../../../types/interfaces/wasi-http-client.d.ts");
export type * from "../../../types/interfaces/wasi-http-client.d.ts";
