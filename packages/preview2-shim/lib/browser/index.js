import * as clocks from "./clocks.js";
import * as filesystem from "./filesystem.js";
import * as http from "./http.js";
import * as io from "./io.js";
import * as logging from "./logging.js";
import * as poll from "./poll.js";
import * as random from "./random.js";
import * as sockets from "./sockets.js";
import * as cliBase from "./cli-base.js";

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
