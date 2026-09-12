import { unsupportedNodeApi } from "../errors/core.js";

export function unsupported(api: string, reason: string): never {
  throw unsupportedNodeApi(api, reason);
}

export function unsupportedContext(api: string): never {
  return unsupported(api, "the guest engine does not expose separate JavaScript realms");
}

export function unsupportedModules(api: string): never {
  return unsupported(
    api,
    "the guest engine does not expose VM module records or a dynamic module loader",
  );
}
