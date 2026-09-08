// Adapt the canonical Preview 2 resources to ComponentizeJS's WIT projections.
export function withWasiSockets(imports) {
    Object.assign(imports["wasi:sockets/instance-network"], imports["wasi:sockets/network"]);
    Object.assign(imports["wasi:sockets/ip-name-lookup"], imports["wasi:sockets/network"]);
    Object.assign(imports["wasi:sockets/tcp-create-socket"], imports["wasi:sockets/tcp"]);
    // The StarlingMonkey fixture adds a method to the otherwise methodless Network
    // resource to make ComponentizeJS 0.22 generate bindings for it.
    imports["wasi:sockets/network"].Network.prototype.noop ??= () => {};
    // Required by StarlingMonkey's 0.2.10 WIT, removed in preview2-shim's 0.2.12.
    // These fixtures never call it.
    imports["wasi:sockets/network"].networkErrorCode ??= () => undefined;
    return imports;
}
