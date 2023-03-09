import * as defaultClocks from "./wasi-default-clocks";
import * as environment from "./wasi-environment";
import * as exit from "./wasi-exit";
import * as filesystem from "./wasi-filesystem";
import * as http from "./wasi-http";
import * as io from "./wasi-io";
import * as logging from "./wasi-logging";
import * as monotonicClock from "./wasi-monotonic-clock";
import * as poll from "./wasi-poll";
import * as random from "./wasi-random";
import * as stderr from "./wasi-stderr";
import * as wallClock from "./wasi-wall-clock";

export interface importObject {
    "wasi-default-clocks": typeof defaultClocks,
    "wasi-environment": typeof environment,
    "wasi-exit": typeof exit,
    "wasi-filesystem": typeof filesystem,
    "wasi-http": typeof http,
    "wasi-io": typeof io,
    "wasi-logging": typeof logging,
    "wasi-monotonic-clock": typeof monotonicClock,
    "wasi-poll": typeof poll,
    "wasi-random": typeof random,
    "wasi-stderr": typeof stderr,
    "wasi-wall-clock": typeof wallClock,
}
