import * as host from "jco:node/dgram@0.1.0";
import { createDgram } from "./dgram/core.js";
const { dgram, dgramCallbacks } = createDgram(host);
export const { Socket, createSocket, _createSocketHandle } = dgram;
export type Socket = InstanceType<typeof Socket>;
export { dgramCallbacks };
export type {
  SocketOptions,
  SocketType,
  BindOptions,
  AddressInfo,
  RemoteInfo,
  SendCallback,
  LookupFunction,
} from "./dgram/types.js";
export default dgram;
