/** HTTP and HTTPS share callbacks inside one bundled component instance. */
import { createHttpCallbackRegistry } from "./impl/direct.js";
export const httpGuestCallbacks = createHttpCallbackRegistry();
