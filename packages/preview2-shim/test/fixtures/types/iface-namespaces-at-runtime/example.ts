// Ensures the `io` interface namespaces are usable as runtime values and not
// just as types, so `tsc` (the `types:check` script) catches a regression to
// type-only re-exports.
import { error, poll, streams } from "../../../../types/io.js";

const _error: typeof error = error;
const _poll: typeof poll = poll;
const _streams: typeof streams = streams;
