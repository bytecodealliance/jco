import { promisify } from "util";

import { Router } from "./resource-worker.js";
import { FSError } from "../filesystem/error.js";
import { wasiTypeFromDirent } from "../filesystem/utils.js";

// Use fs callback API for BigInt offset support
import fs from "fs";
const readAsync = promisify(fs.read);
const writeAsync = promisify(fs.write);
const { opendir } = fs.promises;

const CHUNK_BYTES = 64 * 1024;
const MAX_SAFE_FILE_POSITION = BigInt(Number.MAX_SAFE_INTEGER);

/** Auto‐dispatch all ops */
Router().op("read", handleRead).op("write", handleWrite).op("readDir", handleReadDir);

async function handleRead({ fd, offset, stream }) {
  if (typeof fd !== "number" || fd < 0) {
    throw new TypeError(`Invalid file descriptor: ${fd}`);
  }

  if (!stream || typeof stream.getWriter !== "function") {
    throw new TypeError("stream must have a getWriter() method");
  }

  const writer = stream.getWriter();
  let pos = BigInt(offset);
  try {
    filePosition(pos);
  } catch (err) {
    await writer.close();
    throw err;
  }

  const start = pos;
  while (true) {
    // Each chunk needs its own buffer. A written chunk is only copied to the
    // reader's thread once the reader pulls it, a buffer shared with other
    // read operations could be overwritten by their reads before then
    const buffer = Buffer.alloc(CHUNK_BYTES);
    let bytesRead;
    try {
      ({ bytesRead } = await readAsync(fd, buffer, 0, CHUNK_BYTES, filePosition(pos)));
    } catch (err) {
      await writer.abort(err);
      throw err;
    }
    if (bytesRead === 0) {
      break;
    }

    try {
      await writer.write(buffer.subarray(0, bytesRead));
    } catch {
      // The stream only errors when the reader cancels it, ex: when the guest
      // drops the stream before end of file. As in Wasmtime, that ends the
      // read without an error
      return { bytesRead: pos - start };
    }
    pos += BigInt(bytesRead);
  }

  // A reader that cancels after the last chunk also ends the read without an error
  await writer.close().catch(() => {});
  return { bytesRead: pos - start };
}

async function handleWrite({ fd, offset, stream }) {
  if (typeof fd !== "number" || fd < 0) {
    throw new TypeError(`Invalid file descriptor: ${fd}`);
  }

  if (!stream || typeof stream.getReader !== "function") {
    throw new TypeError("stream must have a getReader() method");
  }

  const reader = stream.getReader();
  try {
    let pos = BigInt(offset);
    const start = pos;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const buf = Buffer.from(value);
      const { bytesWritten } = await writeAsync(fd, buf, 0, buf.length, filePosition(pos));
      pos += BigInt(bytesWritten);
    }
    return { bytesWritten: pos - start };
  } catch (err) {
    await reader.cancel(err);
    throw err;
  }
}

function filePosition(position) {
  if (position < 0n || position > MAX_SAFE_FILE_POSITION) {
    throw new FSError("invalid");
  }
  return Number(position);
}

async function handleReadDir({ fullPath, stream, preopens }) {
  if (!stream || typeof stream.getWriter !== "function") {
    throw new TypeError("stream must have a getWriter() method");
  }

  const writer = stream.getWriter();
  const canAccess = preopens.some((p) => fullPath === p || fullPath.startsWith(p + "/"));

  if (!canAccess) {
    const err = new FSError("not-permitted");
    await writer.abort(err);
    throw err;
  }

  try {
    // Leaving this loop early closes the directory.
    const walker = await opendir(fullPath);
    for await (const dirent of walker) {
      const entry = {
        name: dirent.name,
        type: wasiTypeFromDirent(dirent),
      };
      try {
        await writer.write(entry);
      } catch {
        // The stream only errors when the reader cancels it. Ex: when
        // the guest drops the stream before the last entry. As in Wasmtime,
        // that ends the listing without an error
        return { ok: true };
      }
    }
  } catch (err) {
    await writer.abort(err);
    throw err;
  }

  // A reader that cancels after the last entry also ends the listing without an error
  await writer.close().catch(() => {});
  return { ok: true };
}
