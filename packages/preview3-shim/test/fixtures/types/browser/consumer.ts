import { cli } from "@bytecodealliance/preview3-shim";
import {
  _flush,
  _shutdown,
  _setStdout,
  _setStderr,
  stdout,
  stderr,
} from "@bytecodealliance/preview3-shim/cli";
import type { ErrorCode } from "@bytecodealliance/preview3-shim/interfaces/wasi-cli-types";

const DATA = new ReadableStream<number>();
const PENDING: Promise<{ tag: "ok"; val: void } | { tag: "err"; val: ErrorCode }>[] = [
  cli.stdout.writeViaStream(DATA),
  stdout.writeViaStream(DATA),
  stderr.writeViaStream(DATA),
];
void PENDING;

const LIFECYCLE: Promise<void>[] = [
  cli._flush(),
  cli._shutdown(),
  _flush(),
  _shutdown(),
  stdout._flush(),
  stdout._shutdown(),
  stderr._flush(),
  stderr._shutdown(),
];
void LIFECYCLE;

// Existing handlers remain valid; buffered sinks can optionally acknowledge a drain.
_setStdout({ write(_bytes) {} });
_setStderr({ write(_bytes) {} }, async () => {});
