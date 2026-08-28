import type { incomingHandler as IncomingHandlerNamespace } from "../../types/http.js";
import { handleIncomingRequest } from "./http.js";
import type { WasiIncomingHandler } from "./http.js";

/** A fetch-like browser client for invoking an in-memory WASI HTTP handler. */
export class InMemoryHttpClient {
    readonly #handler: WasiIncomingHandler;

    constructor(handler: WasiIncomingHandler | typeof IncomingHandlerNamespace) {
        this.#handler = typeof handler === "function" ? handler : handler.handle.bind(handler);
    }

    fetch(request: Request): Promise<Response> {
        return handleIncomingRequest(request, this.#handler);
    }
}
