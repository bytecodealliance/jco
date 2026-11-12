import { promisify } from "util";

import { Router } from "./resource-worker.js";
import { FSError } from "../filesystem/error.js";
import { wasiTypeFromDirent } from "../filesystem/utils.js";

// Use fs callback API for BigInt offset support
import fs from "fs";
const readAsync = promisify(fs.read);
const writeAsync = promisify(fs.write);
const fstatAsync = promisify(fs.fstat);
const { opendir } = fs.promises;

const CHUNK_BYTES = 64 * 1024;
const MAX_SAFE_FILE_POSITION = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * Code of the error an operation fails with when the stream it was producing
 * could not take more output. The main thread knows whether its reader
 * cancelled the stream, which is the only expected cause, so it decides
 * whether this is a failure
 */
const STREAM_CLOSED = "ERR_JCO_STREAM_CLOSED";

/**
 * Build the error for an output stream that could not take more output
 *
 * @param {unknown} cause Why the stream rejected the output
 * @returns {Error} An error whose `code` is `STREAM_CLOSED`
 */
function streamClosedError(cause) {
  return Object.assign(new Error("output stream was closed", { cause }), { code: STREAM_CLOSED });
}

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
    } catch (err) {
      // Expected when the reader cancels the stream, ex: when the guest drops
      // it before end of file
      throw streamClosedError(err);
    }
    pos += BigInt(bytesRead);
  }

  try {
    await writer.close();
  } catch (err) {
    // Expected when the reader cancels the stream after the last chunk
    throw streamClosedError(err);
  }
  return { bytesRead: pos - start };
}

/**
 * Write a whole buffer to a file, continuing after short writes
 *
 * @param {number} fd The file descriptor
 * @param {Buffer} buf The bytes to write
 * @param {bigint} position The offset within the file
 * @returns {Promise<void>}
 */
async function writeAll(fd, buf, position) {
  let written = 0;
  while (written < buf.length) {
    const { bytesWritten } = await writeAsync(
      fd,
      buf,
      written,
      buf.length - written,
      filePosition(position + BigInt(written)),
    );
    written += bytesWritten;
  }
}

/** Settles when the last queued append has finished */
let appendQueue: Promise<void> = Promise.resolve();

/**
 * Write a buffer at the end of a file
 *
 * The size lookup and the write happen one append at a time, so appends that
 * run concurrently through this worker cannot write over each other
 *
 * @param {number} fd The file descriptor
 * @param {Buffer} buf The bytes to append
 * @returns {Promise<void>}
 */
function appendAll(fd, buf) {
  const append = appendQueue.then(async () => {
    const { size } = await fstatAsync(fd, { bigint: true });
    await writeAll(fd, buf, size);
  });
  appendQueue = append.catch(() => {});
  return append;
}

/**
 * Write a byte stream to a file
 *
 * @param {object} msg
 * @param {number} msg.fd The file descriptor
 * @param {bigint | number} [msg.offset] The offset within the file, unused when appending
 * @param {boolean} [msg.append] Write each chunk at the end of the file instead of at `offset`
 * @param {ReadableStream<Uint8Array>} msg.stream The bytes to write
 * @returns {Promise<{ bytesWritten: bigint }>}
 */
async function handleWrite({ fd, offset = 0n, append = false, stream }) {
  if (typeof fd !== "number" || fd < 0) {
    throw new TypeError(`Invalid file descriptor: ${fd}`);
  }

  if (!stream || typeof stream.getReader !== "function") {
    throw new TypeError("stream must have a getReader() method");
  }

  const reader = stream.getReader();
  try {
    let pos = BigInt(offset);
    let bytesWritten = 0n;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const buf = Buffer.from(value);
      if (append) {
        await appendAll(fd, buf);
      } else {
        await writeAll(fd, buf, pos);
        pos += BigInt(buf.length);
      }
      bytesWritten += BigInt(buf.length);
    }
    return { bytesWritten };
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
      } catch (err) {
        // Expected when the reader cancels the stream, ex: when the guest
        // drops it before the last entry
        throw streamClosedError(err);
      }
    }
  } catch (err) {
    if (err?.code !== STREAM_CLOSED) {
      await writer.abort(err);
    }
    throw err;
  }

  try {
    await writer.close();
  } catch (err) {
    // Expected when the reader cancels the stream after the last entry
    throw streamClosedError(err);
  }
  return { ok: true };
}
