/**
 * Public `node:stream/iter` module.
 *
 * Adapted from nodejs/node v24.20.0, commit
 * 71b8b174857e25106d39b61a9e6f30d927da8b01,
 * lib/stream/iter.js (MIT license). Local changes expose the portable jco-std
 * implementation without Node's process-level experimental flag machinery.
 */

export {
  broadcastProtocol,
  drainableProtocol,
  shareProtocol,
  shareSyncProtocol,
  toAsyncStreamable,
  toStreamable,
} from "./types.js";
export type * from "./types.js";

export { from, fromSync } from "./from.js";
export {
  array,
  arrayBuffer,
  arrayBufferSync,
  arraySync,
  bytes,
  bytesSync,
  merge,
  ondrain,
  tap,
  tapSync,
  text,
  textSync,
} from "./consumers.js";
export { pipeTo, pipeToSync, pull, pullSync } from "./pull.js";
export { push } from "./push.js";
export { duplex } from "./duplex.js";
export { Broadcast, Share, SyncShare, broadcast, share, shareSync } from "./multicast.js";
export { fromReadable, fromWritable, toReadable, toReadableSync, toWritable } from "./classic.js";

import {
  broadcastProtocol,
  drainableProtocol,
  shareProtocol,
  shareSyncProtocol,
  toAsyncStreamable,
  toStreamable,
} from "./types.js";
import { from, fromSync } from "./from.js";
import {
  array,
  arrayBuffer,
  arrayBufferSync,
  arraySync,
  bytes,
  bytesSync,
  merge,
  ondrain,
  tap,
  tapSync,
  text,
  textSync,
} from "./consumers.js";
import { pipeTo, pipeToSync, pull, pullSync } from "./pull.js";
import { push } from "./push.js";
import { duplex } from "./duplex.js";
import { Broadcast, Share, SyncShare, broadcast, share, shareSync } from "./multicast.js";
import { fromReadable, fromWritable, toReadable, toReadableSync, toWritable } from "./classic.js";

export const Stream = Object.freeze({
  push,
  duplex,
  from,
  fromSync,
  pull,
  pullSync,
  pipeTo,
  pipeToSync,
  bytes,
  text,
  arrayBuffer,
  array,
  bytesSync,
  textSync,
  arrayBufferSync,
  arraySync,
  merge,
  broadcast,
  share,
  shareSync,
  tap,
  tapSync,
  ondrain,
  toStreamable,
  toAsyncStreamable,
  broadcastProtocol,
  shareProtocol,
  shareSyncProtocol,
  drainableProtocol,
});

const streamIter = {
  Stream,
  toStreamable,
  toAsyncStreamable,
  broadcastProtocol,
  shareProtocol,
  shareSyncProtocol,
  drainableProtocol,
  push,
  duplex,
  from,
  fromSync,
  pull,
  pullSync,
  pipeTo,
  pipeToSync,
  bytes,
  text,
  arrayBuffer,
  array,
  bytesSync,
  textSync,
  arrayBufferSync,
  arraySync,
  merge,
  broadcast,
  Broadcast,
  share,
  shareSync,
  Share,
  SyncShare,
  tap,
  tapSync,
  ondrain,
  fromReadable,
  fromWritable,
  toReadable,
  toReadableSync,
  toWritable,
};

export default streamIter;
