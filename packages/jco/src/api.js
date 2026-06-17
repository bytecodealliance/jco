// @ts-check
export { optimizeComponent as opt } from "./cmd/opt.js";
export { transpileComponent as transpile, typesComponent as types } from "./cmd/transpile.js";

export {
    print,
    parse,
    componentWit,
    componentNew,
    componentEmbed,
    metadataAdd,
    metadataShow,
} from "@bytecodealliance/jco-transpile/wasm-tools";

export function preview1AdapterCommandPath() {
    return new URL("../lib/wasi_snapshot_preview1.command.wasm", import.meta.url);
}
export function preview1AdapterReactorPath() {
    return new URL("../lib/wasi_snapshot_preview1.reactor.wasm", import.meta.url);
}
