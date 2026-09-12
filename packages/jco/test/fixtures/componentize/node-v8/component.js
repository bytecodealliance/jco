import v8, { serialize, deserialize, Serializer, DefaultSerializer, DefaultDeserializer } from "node:v8";
import * as namespace from "node:v8";
import { Buffer } from "node:buffer";

export function run(denied) {
    if (denied) {
        const errors = [];

        for (const operation of [() => serialize(1), () => v8.getHeapStatistics(), () => v8.startCpuProfile()]) {
            try {
                operation();
            } catch (error) {
                errors.push({ name: error.name, code: error.code });
            }
        }

        return JSON.stringify({ errors, buildingSnapshot: v8.startupSnapshot.isBuildingSnapshot() });
    }

    const shared = { value: 42 };
    const value = {
        shared,
        alias: shared,
        bigint: 123n,
        bytes: Buffer.from("hello 💚"),
        numbers: new Uint32Array([0xffffffff, 42]),
        map: new Map([[shared, shared]]),
        set: new Set([shared]),
        special: [-0, Infinity, NaN, undefined],
    };
    value.self = value;

    const restored = deserialize(serialize(value));
    const writer = new DefaultSerializer();

    writer.writeHeader();
    writer.writeUint32(0xffffffff);
    writer.writeUint64(0xffffffff, 0xfffffffe);
    writer.writeDouble(-0.25);
    writer.writeRawBytes(Buffer.from("abc"));
    writer.writeValue(value);
    writer.writeValue(value);

    const reader = new DefaultDeserializer(writer.releaseBuffer());
    let scalar;
    let identity;

    try {
        reader.readHeader();
        scalar = [reader.readUint32(), reader.readUint64(), reader.readDouble(), reader.readRawBytes(3).toString()];

        const first = reader.readValue();

        identity = reader.readValue() === first && first.self === first && first.map.get(first.shared) === first.shared;
    } finally {
        reader[Symbol.dispose]();
    }

    const profiler = new v8.GCProfiler();
    profiler.start();
    const gc = profiler.stop();
    const cpu = v8.startCpuProfile();
    const cpuData = JSON.parse(cpu.stop());
    const unsupported = [];

    for (const operation of [
        () => v8.promiseHooks.onInit(() => {}),
        () => v8.queryObjects(Object),
        () => v8.isStringOneByteRepresentation("ascii"),
    ]) {
        try {
            operation();
        } catch (error) {
            unsupported.push(error.code);
        }
    }

    return JSON.stringify({
        module:
            namespace.default === v8 &&
            v8.serialize === serialize &&
            Object.getPrototypeOf(DefaultSerializer) === Serializer,
        graph:
            restored.self === restored &&
            restored.shared === restored.alias &&
            restored.map.get(restored.shared) === restored.shared &&
            restored.set.has(restored.shared),
        bytes: Buffer.isBuffer(restored.bytes) && restored.bytes.equals(value.bytes),
        types:
            restored.bigint === 123n && restored.numbers instanceof Uint32Array && restored.numbers[0] === 0xffffffff,
        special:
            Object.is(restored.special[0], -0) &&
            restored.special[1] === Infinity &&
            Number.isNaN(restored.special[2]) &&
            restored.special[3] === undefined,
        scalar,
        identity,
        tag: v8.cachedDataVersionTag() > 0,
        heap: v8.getHeapStatistics().used_heap_size > 0,
        spaces: v8.getHeapSpaceStatistics().length > 0,
        code: v8.getHeapCodeStatistics().code_and_metadata_size > 0,
        cpp: v8.getCppHeapStatistics("brief").detail_level === "brief",
        gc: gc.version === 1 && Array.isArray(gc.statistics) && profiler.stop() === undefined,
        cpu: cpuData.nodes.length > 0 && cpu.stop() === undefined,
        unsupported,
    });
}
