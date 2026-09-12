import * as node from "node:v8";
import { createMessageCodec, decodeMessage } from "../internal/structured-value.js";
import { serializeHostError } from "../internal/host-error.js";
import type { DecodeSession } from "../internal/structured-value.js";
import type { Writer as WriterContract, Reader as ReaderContract } from "./types.js";

export function nativeCall<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    throw serializeHostError(error);
  }
}

export class Writer implements WriterContract {
  #writer: node.Serializer | undefined;

  #session: DecodeSession = { values: [] };

  constructor(defaults: boolean) {
    this.#writer = defaults ? new node.DefaultSerializer() : new node.Serializer();
  }

  #handle(): node.Serializer {
    if (!this.#writer) {
      throw new Error("Serializer has been released");
    }

    return this.#writer;
  }

  writeHeader(): void {
    nativeCall(() => this.#handle().writeHeader());
  }

  writeValue(graph: string): boolean {
    return nativeCall(() => this.#handle().writeValue(decodeMessage(graph, this.#session)));
  }

  releaseBuffer(): Uint8Array {
    return nativeCall(() => this.#handle().releaseBuffer());
  }

  writeUint32(value: number): void {
    nativeCall(() => this.#handle().writeUint32(value));
  }

  writeUint64(hi: number, lo: number): void {
    nativeCall(() => this.#handle().writeUint64(hi, lo));
  }

  writeDouble(value: number): void {
    nativeCall(() => this.#handle().writeDouble(value));
  }

  writeRawBytes(data: Uint8Array): void {
    nativeCall(() => this.#handle().writeRawBytes(data));
  }

  setTreatViewsAsHostObjects(flag: boolean): void {
    // This documented method is missing from @types/node's Serializer declaration.
    nativeCall(() =>
      Reflect.apply(
        Reflect.get(this.#handle(), "_setTreatArrayBufferViewsAsHostObjects"),
        this.#handle(),
        [flag],
      ),
    );
  }

  [Symbol.dispose](): void {
    this.#writer = undefined;
    this.#session.values = [];
  }
}

export class Reader implements ReaderContract {
  #reader: node.Deserializer | undefined;

  #codec = createMessageCodec({
    api: "v8 deserialization",
    preserveBuffers: true,
    persistent: true,
  });

  constructor(data: Uint8Array, defaults: boolean) {
    this.#reader = defaults ? new node.DefaultDeserializer(data) : new node.Deserializer(data);
  }

  #handle(): node.Deserializer {
    if (!this.#reader) {
      throw new Error("Deserializer has been released");
    }

    return this.#reader;
  }

  readHeader(): boolean {
    return nativeCall(() => this.#handle().readHeader());
  }

  readValue(): string {
    return nativeCall(() => this.#codec.encode(this.#handle().readValue()));
  }

  getWireFormatVersion(): number {
    return nativeCall(() => this.#handle().getWireFormatVersion());
  }

  readUint32(): number {
    return nativeCall(() => this.#handle().readUint32());
  }

  readUint64(): [number, number] {
    return nativeCall(() => this.#handle().readUint64());
  }

  readDouble(): number {
    return nativeCall(() => this.#handle().readDouble());
  }

  readRawBytes(length: number): Uint8Array {
    return nativeCall(() => this.#handle().readRawBytes(length));
  }

  [Symbol.dispose](): void {
    this.#reader = undefined;
    this.#codec = createMessageCodec();
  }
}
