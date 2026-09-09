import { unsupportedNodeApi } from "../errors/core.js";
import { core } from "./core.js";
import type {
  Finished,
  FinishedOptions,
  Callback,
  Pipeline,
  PipelineStage,
  Stream,
  StreamPromises,
} from "./types.js";

function isWebStream(value: unknown): value is ReadableStream | WritableStream {
  return (
    typeof value === "object" &&
    value !== null &&
    (("getReader" in value && typeof value.getReader === "function") ||
      ("getWriter" in value && typeof value.getWriter === "function"))
  );
}

function requireClassic(value: unknown, api: string): void {
  if (isWebStream(value)) {
    throw unsupportedNodeApi(
      api,
      "Web Stream internal state is not exposed by the engine; convert it with Readable.fromWeb() or Writable.fromWeb() first",
    );
  }
}

function stage(value: unknown): unknown {
  if (isWebStream(value)) {
    // The core already pumps to Web writers through getWriter(). Retaining the
    // destination also preserves callback pipeline's return-value identity.
    return "getReader" in value ? core.Readable.fromWeb(value) : value;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "readable" in value &&
    "writable" in value &&
    isWebStream(value.readable) &&
    isWebStream(value.writable)
  ) {
    return core.Duplex.fromWeb(value as ReadableWritablePair);
  }
  return value;
}

function stages(args: unknown[]): unknown[] {
  // Array-form pipelines contain their stages in the first argument. Options and
  // callbacks are left intact. Public Web readers do not need Node private symbols.
  return Array.isArray(args[0]) ? [args[0].map(stage), ...args.slice(1)] : args.map(stage);
}

export function installLifecycle(): void {
  const originalFinished = core.finished;
  const finished: Finished = (
    stream: Stream | ReadableStream | WritableStream,
    options: FinishedOptions | Callback,
    callback?: Callback,
  ): (() => void) => {
    requireClassic(stream, "stream.finished(Web Stream)");
    return typeof options === "function"
      ? originalFinished(stream, options)
      : originalFinished(stream, options, callback!);
  };
  const originalPromiseFinished = core.promises.finished;
  core.promises.finished = async (stream, options): Promise<void> => {
    requireClassic(stream, "stream/promises.finished(Web Stream)");
    return originalPromiseFinished(stream, options);
  };
  const originalPipeline = core.pipeline;
  const pipeline: Pipeline = <T extends Stream | WritableStream>(...args: unknown[]): T =>
    Reflect.apply(originalPipeline, undefined, stages(args));
  const originalPromisePipeline = core.promises.pipeline;
  const promisePipeline: StreamPromises["pipeline"] = <T>(...args: unknown[]): Promise<T> => {
    try {
      return Reflect.apply(originalPromisePipeline, undefined, stages(args));
    } catch (error) {
      return Promise.reject(error);
    }
  };
  core.promises.pipeline = promisePipeline;
  core.pipeline = pipeline;
  core.finished = finished;
  for (const [fn, promiseFn] of [
    [pipeline, promisePipeline],
    [finished, core.promises.finished],
  ]) {
    Object.defineProperty(fn, Symbol.for("nodejs.util.promisify.custom"), {
      configurable: true,
      enumerable: true,
      get: (): unknown => promiseFn,
    });
  }
  const originalCompose = core.compose;
  core.compose = (...streams: PipelineStage[]) =>
    Reflect.apply(originalCompose, undefined, streams.map(stage));
  const originalAbort = core.addAbortSignal;
  core.addAbortSignal = (signal, stream) => {
    requireClassic(stream, "stream.addAbortSignal(Web Stream)");
    return originalAbort(signal, stream);
  };
  function guarded<T>(name: string, original: (stream: unknown) => T): (stream: unknown) => T {
    return (stream: unknown): T => {
      requireClassic(stream, `stream.${name}(Web Stream)`);
      return original(stream);
    };
  }
  core.isReadable = guarded("isReadable", core.isReadable);
  core.isWritable = guarded("isWritable", core.isWritable);
  core.isErrored = guarded("isErrored", core.isErrored);
  core.isDisturbed = guarded("isDisturbed", core.isDisturbed);
  core.Readable.isDisturbed = core.isDisturbed;
}
