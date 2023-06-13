import * as clocks from "./clocks.js";
import * as environment from "./environment.js";
import * as exit from "./exit.js";
import * as filesystem from "./filesystem.js";
import * as monotonicClock from "./clocks.js";
import * as random from "./random.js";
import * as streams from "./io.js";
import * as tcpCreateSocket from "./tcp-create-socket.js";
import * as tcp from "./tcp.js";
import * as timezone from "./timezone.js";
import * as types from "./types.js";
import * as udpCreateSocket from "./udp-create-socket.js";
import * as udp from "./udp.js";
import * as wallClock from "./wall-clock.js";

export const importObject = {
  clocks,
  filesystem,
  http,
  io,
  logging,
  poll,
  random,
  sockets,
  cliBase,
};

export { WasiHttp } from "../http/wasi-http.js";

export default importObject;
