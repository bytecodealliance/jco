import { createFsStreams } from "../streams.js";
import { closeSync, fsyncSync, openSync, readSync, writeSync } from "../sync.js";
// Only creates classes and closures; never calls the host or changes a base class.
const streams = /* @__PURE__ */ createFsStreams({
  openSync,
  readSync,
  writeSync,
  closeSync,
  fsyncSync,
});
export const {
  ReadStream,
  WriteStream,
  FileReadStream,
  FileWriteStream,
  createReadStream,
  createWriteStream,
} = streams;
