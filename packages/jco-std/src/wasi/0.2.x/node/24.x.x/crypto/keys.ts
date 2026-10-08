import { Buffer } from "node:buffer";
import { invalidArgType, invalidArgValue } from "../errors/core.js";

/** Guest-owned secret key bytes. Asymmetric keys require an engine provider. */
export class KeyObject {
  readonly type = "secret";
  readonly #bytes: Buffer;

  constructor(bytes: Uint8Array) {
    this.#bytes = Buffer.from(bytes);
  }

  get symmetricKeySize(): number {
    return this.#bytes.length;
  }

  export(): Buffer;
  export(options: { format?: "buffer" }): Buffer;
  export(options: { format: "jwk" }): { kty: string; k: string };
  export(options?: { format?: string }): Buffer | { kty: string; k: string } {
    if (options?.format === "jwk") {
      return { kty: "oct", k: this.#bytes.toString("base64url") };
    }
    if (options?.format !== undefined && options.format !== "buffer") {
      throw invalidArgValue("options.format", options.format);
    }
    return Buffer.from(this.#bytes);
  }

  equals(other: KeyObject): boolean {
    if (!(other instanceof KeyObject)) {
      throw invalidArgType("otherKeyObject", "KeyObject", other);
    }
    if (this.#bytes.length !== other.#bytes.length) {
      return false;
    }
    let difference = 0;
    for (let i = 0; i < this.#bytes.length; i++) {
      difference |= this.#bytes[i] ^ other.#bytes[i];
    }
    return difference === 0;
  }
}

export function createSecretKey(key: unknown, encoding?: string): KeyObject {
  if (typeof key === "string") {
    return new KeyObject(Buffer.from(key, encoding as BufferEncoding));
  }
  if (key instanceof ArrayBuffer) {
    return new KeyObject(new Uint8Array(key));
  }
  if (ArrayBuffer.isView(key)) {
    return new KeyObject(new Uint8Array(key.buffer, key.byteOffset, key.byteLength));
  }
  throw invalidArgType("key", ["string", "ArrayBuffer", "Buffer", "TypedArray", "DataView"], key);
}
