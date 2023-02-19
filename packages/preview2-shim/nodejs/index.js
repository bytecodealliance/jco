import * as clocks from "./clocks.js";
import * as defaultClocks from "./default-clocks.js";
import * as exit from "./exit.js";
import * as filesystem from "./filesystem.js";
import * as io from "./io.js";
import * as logging from "./logging.js";
import * as poll from "./poll.js";
import * as random from "./random.js";
import * as stderr from "./stderr.js";

export const importObject = {
    "wasi-clocks": clocks,
    "wasi-default-clocks": defaultClocks,
    "wasi-exit": exit,
    "wasi-filesystem": filesystem,
    "wasi-io": io,
    "wasi-logging": logging,
    "wasi-poll": poll,
    "wasi-random": random,
    "wasi-stderr": stderr,
};
