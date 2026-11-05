import { cli } from "@bytecodealliance/preview3-shim";
import { stdout, stderr } from "@bytecodealliance/preview3-shim/cli";
import type { ErrorCode } from "@bytecodealliance/preview3-shim/interfaces/wasi-cli-types";

const data = new ReadableStream<number>();
const pending: Promise<{ tag: "ok"; val: void } | { tag: "err"; val: ErrorCode }>[] = [
  cli.stdout.writeViaStream(data),
  stdout.writeViaStream(data),
  stderr.writeViaStream(data),
];
void pending;

// @ts-expect-error Node lifecycle helpers are absent from the browser API.
cli._flush();
// @ts-expect-error Node lifecycle helpers are absent from the browser API.
stdout._shutdown();
