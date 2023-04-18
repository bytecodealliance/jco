import { ImportObject as WasiProxyImportObject } from "./wasi-proxy";
import { ImportObject as WasiReactorImportObject } from "./wasi-reactor";

export type ImportObject = WasiProxyImportObject & WasiReactorImportObject;

export declare const importObject: ImportObject;

export default importObject;
