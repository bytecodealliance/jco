import { stdout, _setStdout } from "@bytecodealliance/preview2-shim/cli";
import { createOutput } from "./output.js";

const { output, setHandler } = createOutput(() => stdout.getStdout(), _setStdout);

export { setHandler as _setStdout };
export default output satisfies typeof import("../../../types/interfaces/wasi-cli-stdout.d.ts");
export type * from "../../../types/interfaces/wasi-cli-stdout.d.ts";
