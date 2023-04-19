import * as logging from "./logging.js";
import * as defaultOutgoingHttp from "./default-outgoing-HTTP.js";
import * as environment from "./environment.js";
import * as exit from "./exit.js";
import * as filesystem from "./filesystem.js";
import * as http from "./http.js";
import * as monotonicClock from "./monotonic-clock.js";
import * as poll from "./poll.js";
import * as preopens from "./preopens.js";
import * as random from "./random.js";
import * as streams from "./streams.js";
import * as wallClock from "./wall-clock.js";

export const importObject = {
    "default-outgoing-HTTP": defaultOutgoingHttp,
    "environment": environment,
    "exit": exit,
    "filesystem": filesystem,
    "http": http,
    "logging": logging,
    "monotonic-clock": monotonicClock,
    "poll": poll,
    "preopens": preopens,
    "random": random,
    "streams": streams,
    "wall-clock": wallClock,
};

export { WasiHttp } from "../http/wasi-http.js";

export default importObject;
