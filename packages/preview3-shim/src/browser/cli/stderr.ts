import { stderr, _setStderr } from "@bytecodealliance/preview2-shim/cli";
import { createOutput } from "./output.js";

const { output, setHandler } = createOutput(() => stderr.getStderr(), _setStderr);

export { setHandler as _setStderr };
export default output satisfies typeof import("../../../types/interfaces/wasi-cli-stderr.d.ts");
export type * from "../../../types/interfaces/wasi-cli-stderr.d.ts";
