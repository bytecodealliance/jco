import { stderr, _setStderr } from "@bytecodealliance/preview2-shim/cli";
import { createOutput } from "./output.js";

const { output: OUTPUT, setHandler: SET_HANDLER } = createOutput(
  () => stderr.getStderr(),
  _setStderr,
);

export { SET_HANDLER as _setStderr };
export default OUTPUT satisfies typeof import("../../../types/interfaces/wasi-cli-stderr.d.ts");
export type * from "../../../types/interfaces/wasi-cli-stderr.d.ts";
