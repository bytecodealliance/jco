import { Buffer } from "node:buffer";
import { codedError } from "../errors/core.js";
import { createMessageCodec } from "../internal/structured-value.js";
import { call, unsupported } from "./errors.js";
import { bytes } from "./bytes.js";
import type { MessageCodec } from "../internal/structured-value.js";
import type { Writer, V8Host, V8Buffer, SerializationModule } from "./types.js";

function codec(): MessageCodec {
  return createMessageCodec({
    api: "v8 serialization",
    preserveBuffers: true,
    persistent: true,
    cloneError: (message) => new Error(message),
  });
}

/** Native resources retain the binary format and serialization identity table. */
export function createSerializers(
  host: V8Host,
): Pick<SerializationModule, "Serializer" | "DefaultSerializer"> {
  class Serializer {
    #writer: Writer | undefined;

    #codec = codec();

    #defaults: boolean;

    #disposed = false;

    #treatViews: boolean;

    declare _getDataCloneError: ErrorConstructor;

    constructor() {
      if (new.target !== Serializer && new.target !== DefaultSerializer) {
        unsupported("Serializer subclasses");
      }

      this.#defaults = new.target === DefaultSerializer;
      this.#treatViews = this.#defaults;
      this.#writer = call(() => host.openWriter(this.#defaults));
    }

    #handle(): Writer {
      if (this.#disposed) {
        throw codedError(new Error("Serializer has been disposed"), "ERR_INVALID_STATE");
      }

      if (!this.#writer) {
        const writer = call(() => host.openWriter(this.#defaults));

        try {
          call(() => writer.setTreatViewsAsHostObjects(this.#treatViews));
          this.#writer = writer;
        } catch (error) {
          host.releaseWriter(writer);
          throw error;
        }
      }

      return this.#writer;
    }

    writeHeader(): void {
      call(() => this.#handle().writeHeader());
    }

    writeValue(value: unknown): boolean {
      if (this._getDataCloneError !== Error || "_getSharedArrayBufferId" in this) {
        unsupported("Serializer custom callbacks");
      }

      if (
        "_writeHostObject" in this &&
        this._writeHostObject !== DefaultSerializer.prototype._writeHostObject
      ) {
        unsupported("Serializer._writeHostObject()");
      }

      const handle = this.#handle();
      const graph = this.#codec.encode(value);

      return call(() => handle.writeValue(graph));
    }

    releaseBuffer(): V8Buffer {
      const handle = this.#handle();
      const output = call(() => handle.releaseBuffer());

      host.releaseWriter(handle);
      this.#writer = undefined;
      this.#codec = codec();

      return Buffer.from(output);
    }

    transferArrayBuffer(_id: number, _arrayBuffer: ArrayBuffer): void {
      unsupported("Serializer.transferArrayBuffer()");
    }

    writeUint32(value: number): void {
      call(() => this.#handle().writeUint32(value));
    }

    writeUint64(hi: number, lo: number): void {
      call(() => this.#handle().writeUint64(hi, lo));
    }

    writeDouble(value: number): void {
      call(() => this.#handle().writeDouble(value));
    }

    writeRawBytes(buffer: ArrayBufferView): void {
      const data = bytes(buffer);

      call(() => this.#handle().writeRawBytes(data));
    }

    _setTreatArrayBufferViewsAsHostObjects(flag: boolean): void {
      call(() => this.#handle().setTreatViewsAsHostObjects(flag));
      this.#treatViews = flag;
    }

    /** Component extension: release an abandoned native serializer deterministically. */
    [Symbol.dispose](): void {
      this.#disposed = true;
      this.#codec = codec();

      if (this.#writer) {
        host.releaseWriter(this.#writer);
        this.#writer = undefined;
      }
    }
  }

  Object.defineProperty(Serializer.prototype, "_getDataCloneError", {
    value: Error,
    writable: true,
    enumerable: true,
    configurable: true,
  });

  // Node installs its native base methods as enumerable prototype properties.
  for (const name of Object.getOwnPropertyNames(Serializer.prototype)) {
    if (name !== "constructor") {
      Object.defineProperty(Serializer.prototype, name, { enumerable: true });
    }
  }

  class DefaultSerializer extends Serializer {
    _writeHostObject(_object: object): void {
      unsupported("DefaultSerializer._writeHostObject() direct calls");
    }
  }

  return { Serializer, DefaultSerializer };
}
