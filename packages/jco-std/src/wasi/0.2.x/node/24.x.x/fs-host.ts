import type { FsHostQuery } from "./fs/types.js";

/** Default provider: importing `node:fs` never grants host filesystem access. */
export const query: FsHostQuery = () => {
  const error = new Error(
    "node:fs requires an explicitly configured filesystem host provider",
  ) as Error & { code: string };
  error.code = "ERR_JCO_FS_ADAPTER_REQUIRED";
  throw error;
};

export default { query };
