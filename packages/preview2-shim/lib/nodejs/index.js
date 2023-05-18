import * as console from "./console.js";
import * as defaultOutgoingHttp from "./default-outgoing-HTTP.js";
import * as environment from "./environment.js";
import * as exit from "./exit.js";
import * as filesystem from "./filesystem.js";
import * as instanceNetwork from "./instance-network.js";
import * as ipNameLookup from "./ip-name-lookup.js";
import * as monotonicClock from "./monotonic-clock.js";
import * as network from "./network.js";
import * as poll from "./poll.js";
import * as preopens from "./preopens.js";
import * as random from "./random.js";
import * as streams from "./streams.js";
import * as tcpCreateSocket from "./tcp-create-socket.js";
import * as tcp from "./tcp.js";
import * as timezone from "./timezone.js";
import * as types from "./types.js";
import * as udpCreateSocket from "./udp-create-socket.js";
import * as udp from "./udp.js";
import * as wallClock from "./wall-clock.js";

export const importObject = {
  'console': console,
  'default-outgoing-HTTP': defaultOutgoingHttp,
  'environment': environment,
  'exit': exit,
  'filesystem': filesystem,
  'instance-network': instanceNetwork,
  'ip-name-lookup': ipNameLookup,
  'monotonic-clock': monotonicClock,
  'network': network,
  'poll': poll,
  'preopens': preopens,
  'random': random,
  'streams': streams,
  'tcp-create-socket': tcpCreateSocket,
  'tcp': tcp,
  'timezone': timezone,
  'types': types,
  'udp-create-socket': udpCreateSocket,
  'udp': udp,
  'wall-clock': wallClock
};

export { WasiHttp } from "../http/wasi-http.js";

export default importObject;
