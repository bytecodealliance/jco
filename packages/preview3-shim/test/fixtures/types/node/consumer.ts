import { cli } from "@bytecodealliance/preview3-shim";
import { _flush, _shutdown, stdout, stderr } from "@bytecodealliance/preview3-shim/cli";

const pending: Promise<void>[] = [
  cli._flush(),
  cli._shutdown(),
  _flush(),
  _shutdown(),
  stdout._flush(),
  stdout._shutdown(),
  stderr._flush(),
  stderr._shutdown(),
];
void pending;
