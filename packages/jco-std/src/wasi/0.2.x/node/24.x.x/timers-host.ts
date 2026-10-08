import { unsupportedNodeApi } from "./errors/core.js";
const denied = (): never => {
  throw unsupportedNodeApi("node:timers host tasks", "map an instance-bound task timer provider");
};
export const schedule = denied;
export const cancel = denied;
export const setRef = denied;
export default { schedule, cancel, setRef };
