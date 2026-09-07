import type { WorkerExtension, WorkerExtensionContext } from "../../src/io/extension.ts";

export default function create(context: WorkerExtensionContext): WorkerExtension {
    let calls = 0;
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
            default:
                throw new Error("unknown test operation");
        }
    };
}
