import type { WorkerExtension, WorkerExtensionContext } from "../../src/io/extension.ts";
import { Writable } from "node:stream";

export default function create(context: WorkerExtensionContext): WorkerExtension {
    let calls = 0;
    let writtenBytes = 0;
    return (operation: string): unknown => {
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
            default:
                throw new Error("unknown test operation");
        }
    };
}
