import { adapterRequired } from "./http/errors.js";
import type { DirectHttpHost } from "./http/types.js";

export const request: DirectHttpHost["request"] = () => adapterRequired();

export default { request };
