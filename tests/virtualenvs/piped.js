import { _setEnv } from "@bytecodealliance/preview2-shim/cli";
import { _setPreopens } from "@bytecodealliance/preview2-shim/filesystem";

_setEnv({
  PIPED_SIDE: "PRODUCER",
});
