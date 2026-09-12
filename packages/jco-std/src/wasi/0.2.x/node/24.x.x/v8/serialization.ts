import { createSerializers } from "./serializer.js";
import { createDeserializers } from "./deserializer.js";
import type { V8Host, V8Buffer, SerializationModule } from "./types.js";

export function createSerialization(host: V8Host): SerializationModule {
  const { Serializer, DefaultSerializer } = createSerializers(host);
  const { Deserializer, DefaultDeserializer } = createDeserializers(host);

  function serialize(value: unknown): V8Buffer {
    const serializer = new DefaultSerializer();

    try {
      serializer.writeHeader();
      serializer.writeValue(value);

      return serializer.releaseBuffer();
    } finally {
      serializer[Symbol.dispose]();
    }
  }

  function deserialize(buffer: ArrayBufferView): unknown {
    const deserializer = new DefaultDeserializer(buffer);

    try {
      deserializer.readHeader();

      return deserializer.readValue();
    } finally {
      deserializer[Symbol.dispose]();
    }
  }

  return {
    Serializer,
    Deserializer,
    DefaultSerializer,
    DefaultDeserializer,
    serialize,
    deserialize,
  };
}
