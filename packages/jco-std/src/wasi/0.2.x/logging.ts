// NOTE: we can't use log just yet due to lack of support in
// off the shelf hosts like wasmtime
//
// The import *would* look like the below:
//
// import { log } from 'wasi:logging/logging@0.1.0-draft';
//
// /** Default logger which uses info logging */
// const wasiLogInfo = (msg: string, ...rest: string[]) => {
//     log('info', DEFAULT_CONTEXT, [msg, ...rest].join(' '));
// };

// /** Default logger which uses error logging */
// const wasiLogError = (msg: string, ...rest: string[]) => {
//     log('error', DEFAULT_CONTEXT, [msg, ...rest].join(' '));
// };

// /** Default logger which uses trace logging */
// const wasiLogTrace = (msg: string, ...rest: string[]) => {
//     log('trace', DEFAULT_CONTEXT, [msg, ...rest].join(' '));
// };

// /** Default logger which uses debug logging */
// const wasiLogDebug = (msg: string, ...rest: string[]) => {
//     log('debug', DEFAULT_CONTEXT, [msg, ...rest].join(' '));
// };

// /** Default logger which uses warn logging */
// const wasiLogWarn = (msg: string, ...rest: string[]) => {
//     log('warn', DEFAULT_CONTEXT, [msg, ...rest].join(' '));
// };

// /** Default logger which uses critical logging */
// const wasiLogCritical = (msg: string, ...rest: string[]) => {
//     log('critical', DEFAULT_CONTEXT, [msg, ...rest].join(' '));
// };


type LogFn = (s: string) => void;

const DEFAULT_CONTEXT = 'jco-std/http/adapter/hono';

const DEFAULT_LOG_FN_BUILDER = (context: string) => {
    return (level: string, msg: string, ...data: any[]) => {
        console.error(context, msg, { data });
    }
}

interface BuildLoggerArgs {
    logFnBuilder?: (context: string) => (level: string, msg: string) => void;
    context?: string;
}

/**
 * Function for building a reusable logger function that can be used
 * for logging at various levels
 */
export function buildLogger(args?: BuildLoggerArgs) {
    const context = args?.context ?? DEFAULT_CONTEXT;
    const logFnBuilder = args?.logFnBuilder ?? DEFAULT_LOG_FN_BUILDER;
    const logFn = logFnBuilder(context);

    const fn = (msg: string, ...rest: string[]) => {
        logFn('info', msg, ...rest);
    };
    fn.trace = (msg: string, ...rest: string[]) => {
        logFn('trace', msg, ...rest);
    };
    fn.debug = (msg: string, ...rest: string[]) => {
        logFn('debug', msg, ...rest);
    };
    fn.info = (msg: string, ...rest: string[]) => {
        logFn('info', msg, ...rest);
    };
    fn.warn = (msg: string, ...rest: string[]) => {
        logFn('warn', msg, ...rest);
    };
    fn.critical = (msg: string, ...rest: string[]) => {
        logFn('critical', msg, ...rest);
    };
    fn.error = (msg: string, ...rest: string[]) => {
        logFn('error', msg, ...rest);
    };
    return fn;
}
