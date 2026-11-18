import type { WorkerExtension, WorkerExtensionContext } from "../../src/io/extension.ts";
import { PassThrough, Writable } from "node:stream";

export default function create(context: WorkerExtensionContext): WorkerExtension {
    let calls = 0;
    let writtenBytes = 0;
    const spliceSources = new Map<number, PassThrough>();
    const spliceSinks = new Map<number, Buffer[]>();
    return (operation: string, args: unknown[]): unknown => {
        switch (operation) {
            case "count":
                return ++calls;
            case "fail":
                throw new Error("host extension failed");
            case "rejected-future":
                return context.createFuture(Promise.reject({ message: "handshake failed" }));
            case "resources":
                return context.resourceCounts();
            case "small-buffer-output":
                return context.createWritableStream(
                    new Writable({
                        highWaterMark: 1,
                        write(chunk, _encoding, callback) {
                            writtenBytes += chunk.byteLength;
                            callback();
                        },
                    }),
                );
            case "written-bytes":
                return writtenBytes;
            case "buffered-input-error":
            case "buffered-input-close": {
                const stream = new PassThrough();
                const input = context.createReadableStream(stream);
                const output = context.createWritableStream(stream);
                stream.write(Buffer.from("buffered response"));
                const closed = new Promise((resolve) => {
                    stream.once("close", () => resolve({ input, output }));
                });
                stream.destroy(
                    operation === "buffered-input-error"
                        ? Object.assign(new Error("connection reset"), { code: "ECONNRESET" })
                        : undefined,
                );
                return closed;
            }
            case "splice-pair": {
                // A source that holds a few bytes and stays open, as a socket does.
                const source = new PassThrough();
                const chunks: Buffer[] = [];
                const input = context.createReadableStream(source);
                const output = context.createWritableStream(
                    new Writable({
                        write(chunk, _encoding, callback) {
                            chunks.push(Buffer.from(chunk));
                            callback();
                        },
                    }),
                );
                spliceSources.set(input, source);
                spliceSinks.set(output, chunks);
                source.write(Buffer.from("abc"));
                return { input, output };
            }
            case "splice-feed-later": {
                const [input, text] = args as [number, string];
                setTimeout(() => spliceSources.get(input)?.write(Buffer.from(text)), 20);
                return undefined;
            }
            case "splice-end": {
                spliceSources.get(args[0] as number)?.end();
                return undefined;
            }
            case "splice-received":
                return Buffer.concat(spliceSinks.get(args[0] as number) ?? []).toString();
            default:
                throw new Error("unknown test operation");
        }
    };
}
