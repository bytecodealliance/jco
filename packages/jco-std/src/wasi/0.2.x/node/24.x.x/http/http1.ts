import { concatBytes } from "./body.js";
import { invalidArgValue } from "./errors.js";
import type { HttpTransportHeader, HttpTransportRequest, HttpTransportResponse } from "./types.js";

const CRLF = Uint8Array.from([13, 10]);
const HEADER_END = Uint8Array.from([13, 10, 13, 10]);

function bytesIndexOf(source: Uint8Array, needle: Uint8Array, start = 0): number {
  outer: for (let index = start; index <= source.byteLength - needle.byteLength; index += 1) {
    for (let offset = 0; offset < needle.byteLength; offset += 1) {
      if (source[index + offset] !== needle[offset]) {
        continue outer;
      }
    }
    return index;
  }
  return -1;
}

function latin1(value: Uint8Array): string {
  return String.fromCharCode(...value);
}

function ascii(value: string): Uint8Array {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}

function wireHeaders(headers: readonly HttpTransportHeader[]): Uint8Array[] {
  return headers.flatMap(({ name, value }) => [ascii(`${name}: `), value, CRLF]);
}

export function serializeHttp1Request(request: HttpTransportRequest): Uint8Array {
  const hasConnection = request.headers.some(({ name }) => name.toLowerCase() === "connection");
  const headers = hasConnection
    ? request.headers
    : [...request.headers, { name: "Connection", value: ascii("close") }];
  return concatBytes([
    ascii(`${request.method} ${request.pathWithQuery} HTTP/1.1\r\n`),
    ...wireHeaders(headers),
    CRLF,
    request.body,
  ]);
}

interface ChunkedBody {
  body: Uint8Array;
  consumed: number;
}

function chunkedBody(source: Uint8Array, start: number): ChunkedBody | undefined {
  const chunks: Uint8Array[] = [];
  let offset = start;
  for (;;) {
    const lineEnd = bytesIndexOf(source, CRLF, offset);
    if (lineEnd < 0) {
      return undefined;
    }
    const sizeText = latin1(source.subarray(offset, lineEnd)).split(";", 1)[0].trim();
    if (!/^[0-9a-f]+$/i.test(sizeText)) {
      throw invalidArgValue("chunk size", sizeText);
    }
    const size = Number.parseInt(sizeText, 16);
    offset = lineEnd + 2;
    if (size === 0) {
      const trailersEnd = bytesIndexOf(source, HEADER_END, offset);
      if (trailersEnd >= 0) {
        return { body: concatBytes(chunks), consumed: trailersEnd + 4 };
      }
      if (source.byteLength >= offset + 2 && source[offset] === 13 && source[offset + 1] === 10) {
        return { body: concatBytes(chunks), consumed: offset + 2 };
      }
      return undefined;
    }
    if (source.byteLength < offset + size + 2) {
      return undefined;
    }
    chunks.push(source.slice(offset, offset + size));
    offset += size;
    if (source[offset] !== 13 || source[offset + 1] !== 10) {
      throw invalidArgValue("chunk framing", "missing CRLF");
    }
    offset += 2;
  }
}

function responseHead(source: Uint8Array):
  | {
      statusCode: number;
      statusMessage: string;
      httpVersion: string;
      headers: HttpTransportHeader[];
      bodyOffset: number;
    }
  | undefined {
  const end = bytesIndexOf(source, HEADER_END);
  if (end < 0) {
    return undefined;
  }
  const lines = latin1(source.subarray(0, end)).split("\r\n");
  const status = /^HTTP\/(\d+\.\d+)\s+(\d{3})(?:\s+(.*))?$/.exec(lines.shift() ?? "");
  if (!status) {
    throw invalidArgValue("HTTP response status line", latin1(source.subarray(0, end)));
  }
  const headers: HttpTransportHeader[] = [];
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon < 1) {
      throw invalidArgValue("HTTP response header", line);
    }
    headers.push({ name: line.slice(0, colon), value: ascii(line.slice(colon + 1).trimStart()) });
  }
  return {
    statusCode: Number(status[2]),
    statusMessage: status[3] ?? "",
    httpVersion: status[1],
    headers,
    bodyOffset: end + 4,
  };
}

function headerValues(headers: readonly HttpTransportHeader[], name: string): string[] {
  return headers
    .filter((header) => header.name.toLowerCase() === name)
    .map((header) => latin1(header.value));
}

function completedResponse(
  head: Exclude<ReturnType<typeof responseHead>, undefined>,
  body: Uint8Array,
): HttpTransportResponse {
  return {
    statusCode: head.statusCode,
    statusMessage: head.statusMessage,
    httpVersion: head.httpVersion,
    headers: head.headers,
    body,
  };
}

export function parseHttp1Response(
  source: Uint8Array,
  requestMethod: string,
  closed = false,
): HttpTransportResponse | undefined {
  let remaining = source;
  for (;;) {
    const head = responseHead(remaining);
    if (!head) {
      if (closed && remaining.byteLength > 0) {
        throw invalidArgValue("HTTP response", "incomplete headers");
      }
      return undefined;
    }
    if (head.statusCode >= 100 && head.statusCode < 200 && head.statusCode !== 101) {
      remaining = remaining.subarray(head.bodyOffset);
      continue;
    }
    const bodySource = remaining.subarray(head.bodyOffset);
    const noBody =
      requestMethod === "HEAD" ||
      (head.statusCode >= 100 && head.statusCode < 200) ||
      head.statusCode === 204 ||
      head.statusCode === 304;
    if (noBody) {
      return completedResponse(head, new Uint8Array());
    }
    const transferEncoding = headerValues(head.headers, "transfer-encoding")
      .join(",")
      .toLowerCase();
    if (
      transferEncoding
        .split(",")
        .map((value) => value.trim())
        .includes("chunked")
    ) {
      const parsed = chunkedBody(remaining, head.bodyOffset);
      return parsed ? completedResponse(head, parsed.body) : undefined;
    }
    const lengths = headerValues(head.headers, "content-length");
    if (lengths.length > 0) {
      const unique = new Set(
        lengths.flatMap((value) => value.split(",").map((part) => part.trim())),
      );
      if (unique.size !== 1) {
        throw invalidArgValue("content-length", lengths.join(", "));
      }
      const length = Number([...unique][0]);
      if (!Number.isSafeInteger(length) || length < 0) {
        throw invalidArgValue("content-length", [...unique][0]);
      }
      if (bodySource.byteLength < length) {
        if (closed) {
          throw invalidArgValue("HTTP response", "body ended before content-length bytes arrived");
        }
        return undefined;
      }
      return completedResponse(head, bodySource.slice(0, length));
    }
    return closed ? completedResponse(head, bodySource.slice()) : undefined;
  }
}
