import { parentPort } from "worker_threads";
import { Readable, Writable } from "node:stream";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "stream/promises";

import fs from "fs";

async function handleRead(msg) {
  const { id, fd, offset, stream } = msg;
  const readable = createReadStream(null, {
    fd,
    start: offset,
    autoClose: false,
    highWaterMark: 64 * 1024,
  });

  const writable = Writable.fromWeb(stream);
  await pipeline(readable, writable);

  parentPort.postMessage({ id, result: { ok: true } });
}

async function handleWrite(msg) {
  const { id, fd, offset, stream } = msg;
  const readable = Readable.fromWeb(stream);
  const writable = createWriteStream(null, {
    fd,
    start: offset,
    autoClose: false,
    highWaterMark: 64 * 1024,
  });

  await pipeline(readable, writable);

  parentPort.postMessage({
    id,
    result: { ok: true, bytesWritten: writable.bytesWritten },
  });
}

async function handleAppend(msg) {
  const { id, fd, stream } = msg;

  const readable = Readable.fromWeb(stream);
  const writable = createWriteStream(null, {
    fd,
    flags: "a",
    autoClose: false,
    highWaterMark: 64 * 1024,
  });

  await pipeline(readable, writable);

  parentPort.postMessage({
    id,
    result: { ok: true, bytesWritten: writable.bytesWritten },
  });
}

async function handleReadDir(msg) {
  const { id, fullPath, stream } = msg;
  const writer = stream.getWriter();
  const walker = await fs.promises.opendir(fullPath);

  for await (const dirent of walker) {
    const entry = {
      name: dirent.name,
      type: lookupType(dirent),
    };

    await writer.write(entry);
  }

  await writer.close();
  parentPort.postMessage({ id, result: { ok: true } });
}

parentPort.on("message", async (msg) => {
  try {
    const { op } = msg;
    if (op === "read") {
      await handleRead(msg);
    } else if (op === "write") {
      await handleWrite(msg);
    } else if (op === "append") {
      await handleAppend(msg);
    } else if (op === "readDir") {
      await handleReadDir(msg);
    } else {
      throw new Error("Unknown operation: " + op);
    }
  } catch (e) {
    parentPort.postMessage({ id: msg.id, error: e });
  }
});

function lookupType(obj) {
  if (obj.isFile()) return "regular-file";
  else if (obj.isSocket()) return "socket";
  else if (obj.isSymbolicLink()) return "symbolic-link";
  else if (obj.isFIFO()) return "fifo";
  else if (obj.isDirectory()) return "directory";
  else if (obj.isCharacterDevice()) return "character-device";
  else if (obj.isBlockDevice()) return "block-device";
  return "unknown";
}
