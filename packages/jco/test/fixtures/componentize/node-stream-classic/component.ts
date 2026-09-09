import stream, { Readable, Writable, Transform, PassThrough, Duplex, duplexPair, addAbortSignal } from "node:stream";
import promises, { pipeline, finished } from "node:stream/promises";
import { text } from "node:stream/consumers";
import { EventEmitter } from "node:events";
import { Buffer } from "node:buffer";

export async function run(): Promise<string> {
    const result: Record<string, unknown> = {};
    result.identities = stream.Stream === stream && stream.promises === promises && promises.pipeline === pipeline;
    result.emitter = new Readable() instanceof EventEmitter;
    result.classes = new PassThrough() instanceof Transform && new Duplex() instanceof Writable;
    result.operators = await Readable.from([1, 2, 3, 4])
        .map((value: number): number => value * 2)
        .filter((value: number): boolean => value > 4)
        .toArray();
    result.reduce = await Readable.from([1, 2, 3]).reduce((sum: number, value: number): number => sum + value, 0);
    result.flatMap = await Readable.from([1, 2])
        .flatMap((value: number): number[] => [value, value])
        .take(3)
        .toArray();
    result.some = await Readable.from([1, 2]).some((value: number): boolean => value === 2);
    result.every = await Readable.from([1, 2]).every((value: number): boolean => value > 0);
    result.find = await Readable.from([1, 2]).find((value: number): boolean => value === 2);
    const consumed: string[] = [];
    const transform = new Transform({
        transform(
            chunk: Uint8Array,
            _encoding: string,
            callback: (error?: Error | null, chunk?: unknown) => void,
        ): void {
            callback(null, Buffer.from(chunk).toString().toUpperCase());
        },
        flush(callback: (error?: Error | null, chunk?: unknown) => void): void {
            callback(null, "!");
        },
    });
    const sink = new Writable({
        write(chunk: Uint8Array, _encoding: string, callback: (error?: Error | null) => void): void {
            consumed.push(Buffer.from(chunk).toString());
            callback();
        },
    });
    await pipeline(Readable.from(["classic", " streams"]), transform, sink);
    result.pipeline = consumed.join("");
    result.finished = sink.writableFinished;
    const readable = new Readable({ read(): void {} });
    readable.push(new DataView(new Uint8Array([0, 65, 66, 0]).buffer, 1, 2));
    readable.push(null);
    const chunk: unknown = readable.read();
    result.bufferIdentity = Buffer.isBuffer(chunk) && chunk instanceof Buffer;
    result.bufferText = String(chunk);

    const partial = Readable.from([1, 2, 3]);
    const iterator = partial.iterator({ destroyOnReturn: false });
    await iterator.next();
    await iterator.return?.();
    result.iterator = await partial.toArray();
    const [first, second] = duplexPair({ objectMode: true });
    const inbound = first.toArray();
    const outbound = second.toArray();
    first.end("out");
    second.end("in");
    result.pair = [await inbound, await outbound];
    const disposed = Readable.from([1]);
    await disposed[Symbol.asyncDispose]();
    result.disposed = disposed.destroyed;
    return JSON.stringify(result);
}

export async function runWeb(): Promise<string> {
    const result: Record<string, unknown> = {};
    result.consumer = await text(Readable.from(["consumer"]));
    const controller = new AbortController();
    const aborted = addAbortSignal(controller.signal, new Readable({ read(): void {} }));
    const completion = finished(aborted).catch((error: unknown): string => (error as Error & { code: string }).code);
    controller.abort();
    result.abort = await completion;
    const bytes = new Uint8Array([65, 66]);
    const web = Readable.toWeb(Readable.from([bytes], { objectMode: false }));
    result.web = await text(Readable.fromWeb(web));
    const pair = Duplex.toWeb(new PassThrough());
    const webRead = text(pair.readable);
    const writer = pair.writable.getWriter();
    await writer.write(new Uint8Array([67]));
    await writer.close();
    result.webPair = await webRead;
    return JSON.stringify(result);
}
