import * as host from "jco:node/fs@0.1.0";

import { createFs } from "./callbacks.js";
import { createFsCore } from "./core.js";
import { createFsPromises } from "./promises.js";

export const filesystemCore = createFsCore(host);
export const promises = createFsPromises(filesystemCore);
export const filesystem = createFs(filesystemCore, promises);
