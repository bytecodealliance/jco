import { promises } from "./index.js";
import type { StreamPromises } from "./types.js";

export const finished: StreamPromises["finished"] = promises.finished;
export const pipeline: StreamPromises["pipeline"] = promises.pipeline;
export default promises;
