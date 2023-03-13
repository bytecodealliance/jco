import * as defaultClocks from "./default-clocks";
import * as environment from "./environment";
import * as exit from "./exit";
import * as filesystem from "./filesystem";
import * as http from "./http";
import * as io from "./io";
import * as logging from "./logging";
import * as monotonicClock from "./monotonic-clock";
import * as poll from "./poll";
import * as random from "./random";
import * as stderr from "./stderr";
import * as wallClock from "./wall-clock";

export interface ImportObject {
    "default-clocks": typeof defaultClocks,
    "environment": typeof environment,
    "exit": typeof exit,
    "filesystem": typeof filesystem,
    "http": typeof http,
    "io": typeof io,
    "logging": typeof logging,
    "monotonic-clock": typeof monotonicClock,
    "poll": typeof poll,
    "random": typeof random,
    "stderr": typeof stderr,
    "wall-clock": typeof wallClock,
}

export declare const importObject: ImportObject;

export default importObject;
