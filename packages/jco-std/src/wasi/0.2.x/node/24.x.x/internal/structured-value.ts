/**
 * Shared bounded graph transport extracted from worker-threads/codec.ts.
 * Worker defaults preserve its clone-mark policy and Uint8Array treatment of Buffer.
 * V8 opts into Buffer branding and persistent identities between native serdes calls.
 * The graph is transport only; it is never returned as a V8 serialization buffer.
 */
import { createEncoder } from "./structured-value/encode.js";
import { objectLike } from "./structured-value/types.js";
import type { CodecOptions, MessageCodec } from "./structured-value/types.js";

export { decodeMessage } from "./structured-value/decode.js";

export type { CodecOptions, MessageCodec, DecodeSession } from "./structured-value/types.js";

export function createMessageCodec(options: CodecOptions = {}): MessageCodec {
  const uncloneable = new WeakSet<object>();
  const untransferable = new WeakSet<object>();

  return {
    encode: createEncoder(options, uncloneable),

    markAsUncloneable(value: unknown): void {
      // Node's clone flag applies to ordinary objects, not built-in value serializers.
      if (
        objectLike(value) &&
        !Array.isArray(value) &&
        !ArrayBuffer.isView(value) &&
        !(value instanceof ArrayBuffer) &&
        !(value instanceof Map) &&
        !(value instanceof Set) &&
        !(value instanceof Date) &&
        !(value instanceof RegExp)
      ) {
        uncloneable.add(value);
      }
    },

    markAsUntransferable(value: unknown): void {
      if (objectLike(value)) {
        untransferable.add(value);
      }
    },

    isMarkedAsUntransferable(value: unknown): boolean {
      return objectLike(value) && untransferable.has(value);
    },
  };
}
