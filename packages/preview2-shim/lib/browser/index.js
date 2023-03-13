import * as defaultClocks from "./default-clocks.js";
import * as environment from "./environment.js";
import * as exit from "./exit.js";
import * as filesystem from "./filesystem.js";
import * as http from "./http.js";
import * as io from "./io.js";
import * as logging from "./logging.js";
import * as monotonicClock from "./monotonic-clock.js";
import * as poll from "./poll.js";
import * as random from "./random.js";
import * as stderr from "./stderr.js";
import * as wallClock from "./wall-clock.js";

export const importObject = {
    "default-clocks": defaultClocks,
    "environment": environment,
    "exit": exit,
    "filesystem": filesystem,
    "http": http,
    "io": io,
    "logging": logging,
    "monotonic-clock": monotonicClock,
    "poll": poll,
    "random": random,
    "stderr": stderr,
    "wall-clock": wallClock,
};

export default importObject;
