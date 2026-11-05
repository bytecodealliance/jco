import type { OutputStreamHandler } from "@bytecodealliance/preview2-shim/io";
import {
  preview2StreamErrorCode,
  writeToPreview2Output,
  type ByteStream,
  type Preview2OutputStream,
  type StreamReaderLike,
} from "../streams.js";

const SYMBOL_DISPOSE = Symbol.dispose ?? Symbol.for("dispose");

/** A host acknowledgement for output queued on a buffered or asynchronous sink. */
export type OutputDrain = () => void | Promise<void>;

/** Close a host reader without waiting for an async iterator's return() to finish. */
function outputReader(data: ByteStream) {
  let next: (options: { count: number }) => unknown;
  let dispose: () => unknown;
  let interrupt = false;
  if (typeof (data as StreamReaderLike).read === "function") {
    const reader = data as StreamReaderLike;
    next = (options) => reader.read(options);
    const close = reader[SYMBOL_DISPOSE] ?? reader.close ?? reader.cancel;
    dispose = () => close?.call(reader);
    // Generated stream disposal finishes its pending copy, which may contain
    // accepted bytes that must be drained before stopping the transfer.
    interrupt = !close;
  } else if (typeof (data as ReadableStream<number>).getReader === "function") {
    const reader = (data as ReadableStream<number>).getReader();
    next = async () => {
      try {
        const result = await reader.read();
        if (result.done) {
          reader.releaseLock();
        }
        return result;
      } catch (error) {
        reader.releaseLock();
        throw error;
      }
    };
    dispose = () => {
      const cancelled = reader.cancel();
      reader.releaseLock();
      return cancelled;
    };
  } else {
    const iterator = (data as AsyncIterable<unknown>)[Symbol.asyncIterator]();
    next = () => iterator.next();
    dispose = () => iterator.return?.();
    interrupt = true;
  }

  let ended = false;
  let finishRead: (() => void) | undefined;
  return {
    /** Read one chunk, allowing shutdown to interrupt a suspended async iterator. */
    async read(options: { count: number }) {
      if (ended) {
        return null;
      }
      const closed = new Promise<null>((resolve) => {
        finishRead = () => resolve(null);
      });
      try {
        const reading = next(options);
        const result = await (interrupt ? Promise.race([reading, closed]) : reading);
        if (
          result === null ||
          (result && typeof result === "object" && "done" in result && result.done)
        ) {
          ended = true;
        }
        return result;
      } finally {
        finishRead = undefined;
      }
    },
    /** Stop further reads while preserving an in-flight generated stream copy. */
    close() {
      if (ended) {
        return;
      }
      ended = true;
      if (interrupt) {
        finishRead?.();
      }
      // Source cleanup may settle after disposal; its failures cannot be
      // delivered to a reader whose host-owned end has already been closed.
      Promise.resolve(dispose()).catch(() => {});
    },
  };
}

/** Add host lifecycle helpers without changing Preview 2 output handler semantics. */
export function createOutput(
  getOutput: () => Preview2OutputStream,
  setOutput: (handler: OutputStreamHandler) => void,
) {
  const transfers = new Set<{ close(): void; finished: Promise<unknown> }>();
  let drain: OutputDrain | undefined;

  /** Preserve the existing setter and optionally register a destination drain acknowledgement. */
  function setHandler(handler: OutputStreamHandler, acknowledge?: OutputDrain) {
    setOutput(handler);
    drain = acknowledge;
  }

  const output = {
    /** Transfer stream bytes using the existing synchronous output handler contract. */
    async writeViaStream(data: ByteStream) {
      try {
        const reader = outputReader(data);
        const transfer = { close: () => reader.close(), finished: null as Promise<unknown> };
        transfers.add(transfer);
        const finished = writeToPreview2Output(reader, getOutput())
          .then(() => ({ tag: "ok" as const, val: undefined }))
          .catch((error) => {
            reader.close();
            return { tag: "err" as const, val: preview2StreamErrorCode(error) };
          })
          .finally(() => transfers.delete(transfer));
        transfer.finished = finished;
        return await finished;
      } catch (error) {
        return { tag: "err" as const, val: preview2StreamErrorCode(error) };
      }
    },
    /** Flush the destination and await its optional acknowledgement without guest EOF. */
    async _flush() {
      const acknowledge = drain;
      getOutput().blockingFlush();
      await acknowledge?.();
    },
    /** Close active host readers and drain accepted output, leaving the destination open. */
    async _shutdown() {
      const pending = [...transfers];
      for (const transfer of pending) {
        transfer.close();
      }
      await Promise.all(pending.map((transfer) => transfer.finished));
      await output._flush();
    },
  };
  return { output, setHandler };
}
