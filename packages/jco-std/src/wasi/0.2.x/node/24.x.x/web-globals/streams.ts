import {
  ReadableStream as Stream,
  WritableStream as Sink,
  TransformStream as Transform,
} from "web-streams-polyfill";

export const ReadableStream =
  globalThis.ReadableStream ?? (Stream as unknown as typeof globalThis.ReadableStream);
export const WritableStream =
  globalThis.WritableStream ?? (Sink as unknown as typeof globalThis.WritableStream);
export const TransformStream =
  globalThis.TransformStream ?? (Transform as unknown as typeof globalThis.TransformStream);
