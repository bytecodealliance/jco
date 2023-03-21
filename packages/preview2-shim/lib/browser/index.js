import * as console from "./console.js";
import * as defaultOutgoingHttp from "./default-outgoing-HTTP.js";
import * as environment from "./environment.js";
import * as exit from "./exit.js";
import * as filesystem from "./filesystem.js";
import * as http from "./http.js";
import * as instanceMonotonicClock from "./instance-monotonic-clock.js";
import * as instanceWallClock from "./instance-wall-clock.js";
import * as io from "./io.js";
import * as monotonicClock from "./monotonic-clock.js";
import * as poll from "./poll.js";
import * as random from "./random.js";
import * as stderr from "./stderr.js";
import * as streams from "./streams.js";
import * as types from "./types.js";
import * as wallClock from "./wall-clock.js";

export const importObject = {
    "console": console,
    "default-outgoing-HTTP": defaultOutgoingHttp,
    "environment": environment,
    "exit": exit,
    "filesystem": filesystem,
    "http": http,
    "instance-monotonic-clock": instanceMonotonicClock,
    "instance-wall-clock": instanceWallClock,
    "io": io,
    "monotonic-clock": monotonicClock,
    "poll": poll,
    "random": random,
    "stderr": stderr,
    "streams": streams,
    "types": types,
    "wall-clock": wallClock,
};

export default importObject;
