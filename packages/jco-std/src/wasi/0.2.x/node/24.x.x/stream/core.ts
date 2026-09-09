import portableStream from "readable-stream/lib/stream.js";
import type { StreamModule } from "./types.js";

// readable-stream v4.7.0, commit 88df21041dc26c210fab3e074ab6bb681a604b8e,
// lib/stream.js is the MIT-licensed portable Node 18.19 stream core.
// Its published JS has no declarations. This boundary describes the audited
// runtime contract; index.ts installs Node 24 additions before exposing it.
export const core: StreamModule = portableStream;
