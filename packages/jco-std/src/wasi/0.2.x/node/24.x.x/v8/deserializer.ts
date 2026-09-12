import { Buffer } from "node:buffer";
import { codedError } from "../errors/core.js";
import { decodeMessage } from "../internal/structured-value.js";
import { call, unsupported } from "./errors.js";
import { bytes } from "./bytes.js";
import type { DecodeSession } from "../internal/structured-value.js";
import type { Reader, V8Host, V8Buffer, SerializationModule } from "./types.js";

/** Read native bytes while retaining guest identities across successive values. */
export function createDeserializers(
  host: V8Host,
): Pick<SerializationModule, "Deserializer" | "DefaultDeserializer"> {
  class Deserializer {
    readonly buffer: ArrayBufferView;

    #reader: Reader | undefined;

    #session: DecodeSession = { values: [] };

    constructor(buffer: ArrayBufferView) {
      if (new.target !== Deserializer && new.target !== DefaultDeserializer) {
        unsupported("Deserializer subclasses");
      }

      this.buffer = buffer;
      this.#reader = call(() => host.openReader(bytes(buffer), new.target === DefaultDeserializer));
    }

    #handle(): Reader {
      if (!this.#reader) {
        throw codedError(new Error("Deserializer has been disposed"), "ERR_INVALID_STATE");
      }

      return this.#reader;
    }

    readHeader(): boolean {
      return call(() => this.#handle().readHeader());
    }

    readValue(): unknown {
      if (
        "_readHostObject" in this &&
        this._readHostObject !== DefaultDeserializer.prototype._readHostObject
      ) {
        unsupported("Deserializer._readHostObject()");
      }

      return decodeMessage(
        call(() => this.#handle().readValue()),
        this.#session,
      );
    }

    transferArrayBuffer(_id: number, _arrayBuffer: ArrayBuffer): void {
      unsupported("Deserializer.transferArrayBuffer()");
    }

    getWireFormatVersion(): number {
      return call(() => this.#handle().getWireFormatVersion()) >>> 0;
    }

    readUint32(): number {
      return call(() => this.#handle().readUint32()) >>> 0;
    }

    readUint64(): [number, number] {
      const [hi, lo] = call(() => this.#handle().readUint64());

      return [hi >>> 0, lo >>> 0];
    }

    readDouble(): number {
      return call(() => this.#handle().readDouble());
    }

    _readRawBytes(_length: number): number {
      return unsupported("Deserializer._readRawBytes() native offsets");
    }

    readRawBytes(length: number): V8Buffer {
      return Buffer.from(call(() => this.#handle().readRawBytes(length)));
    }

    /** Component extension: release the native reader after consuming its values. */
    [Symbol.dispose](): void {
      if (this.#reader) {
        host.releaseReader(this.#reader);
        this.#reader = undefined;
        this.#session.values = [];
      }
    }
  }

  // Node installs its native base methods as enumerable prototype properties.
  for (const name of Object.getOwnPropertyNames(Deserializer.prototype)) {
    if (name !== "constructor") {
      Object.defineProperty(Deserializer.prototype, name, { enumerable: true });
    }
  }

  class DefaultDeserializer extends Deserializer {
    _readHostObject(): unknown {
      return unsupported("DefaultDeserializer._readHostObject() direct calls");
    }
  }

  return { Deserializer, DefaultDeserializer };
}
