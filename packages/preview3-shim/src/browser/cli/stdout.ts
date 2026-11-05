import { stdout, _setStdout } from "@bytecodealliance/preview2-shim/cli";
import { createOutput } from "./output.js";

const { output: OUTPUT, setHandler: SET_HANDLER } = createOutput(
  () => stdout.getStdout(),
  _setStdout,
);

export { SET_HANDLER as _setStdout };
export default OUTPUT satisfies typeof import("../../../types/interfaces/wasi-cli-stdout.d.ts");
export type * from "../../../types/interfaces/wasi-cli-stdout.d.ts";
