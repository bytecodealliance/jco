import util, {
    promisify,
    callbackify,
    MIMEType,
    MIMEParams,
    inspect,
    format,
    formatWithOptions,
    parseArgs,
    parseEnv,
    diff,
    styleText,
    stripVTControlCharacters,
    toUSVString,
    isDeepStrictEqual,
    inherits,
    TextEncoder,
    TextDecoder,
} from "node:util";
import * as namespace from "node:util";
import types, * as typeNamespace from "node:util/types";

const answer = await promisify((value, callback) => callback(null, value + 1))(41);
const callback = await new Promise((resolve) =>
    callbackify(async () => "callback")((error, value) => resolve([error, value])),
);

export function run() {
    const mime = new MIMEType('Text/HTML; charset="utf-8"; title="a;b"');
    mime.params.set("X", "y");
    const params = new MIMEParams();
    params.set("EMPTY", "");
    const cycle = {};
    cycle.self = cycle;

    function Parent() {}

    function Child() {}

    inherits(Child, Parent);
    const refusals = {};
    for (const name of [
        "getCallSites",
        "getSystemErrorName",
        "getSystemErrorMessage",
        "getSystemErrorMap",
        "setTraceSigInt",
        "convertProcessSignalToExitCode",
        "debuglog",
        "deprecate",
        "transferableAbortController",
        "transferableAbortSignal",
        "_extend",
        "isArray",
        "_errnoException",
        "_exceptionWithHostPort",
    ]) {
        try {
            util[name]();
        } catch (error) {
            refusals[name] = error.code;
        }
    }
    let encoded, decoded;
    try {
        encoded = [...new TextEncoder().encode("🌍")];
    } catch (error) {
        encoded = error.code;
    }
    try {
        decoded = new TextDecoder().decode(new Uint8Array([240, 159, 140, 141]));
    } catch (error) {
        decoded = error.code;
    }
    return JSON.stringify({
        identity:
            namespace.default === util &&
            util.types === types &&
            typeNamespace.isUint8Array === types.isUint8Array &&
            util.MIMEType === MIMEType,
        exports: Object.keys(util).sort(),
        answer,
        callback,
        mime: [mime.essence, [...mime.params], String(mime), params.toJSON()],
        args: parseArgs({
            args: ["-vv", "--name=guest", "--no-color", "tail"],
            options: {
                verbose: { type: "boolean", short: "v", multiple: true },
                name: { type: "string" },
                color: { type: "boolean", default: true },
            },
            allowNegative: true,
            allowPositionals: true,
            tokens: true,
        }),
        env: parseEnv('FOO=bar\nexport GREETING="hello\\nworld"'),
        diff: diff("abc", "adc"),
        formatted: format("%s %d %j", "ok", 3, { x: 1 }),
        options: formatWithOptions({ sorted: true }, "%O", { z: 1, a: 2 }),
        inspected: [
            inspect(cycle),
            inspect({
                get x() {
                    throw Error("getter invoked");
                },
            }),
            inspect({
                [inspect.custom]() {
                    return { custom: true };
                },
            }),
        ],
        styled: styleText(["bold", "red"], "hello", { validateStream: false }),
        stripped: stripVTControlCharacters("\x1b[31mred\x1b[0m"),
        unicode: toUSVString("\ud800x🌍"),
        encoded,
        decoded,
        equal: isDeepStrictEqual(new Map([[1, { x: 2 }]]), new Map([[1, { x: 2 }]])),
        inherited: Object.getPrototypeOf(Child.prototype) === Parent.prototype,
        brands: [
            types.isUint8Array(new Uint8Array(1)),
            types.isDataView(new DataView(new ArrayBuffer(1))),
            types.isBoxedPrimitive(Object(false)),
            types.isBooleanObject(false),
            types.isMap(new Map()),
            types.isSet(new Set()),
            types.isPromise(Promise.resolve()),
            types.isArrayBuffer(new ArrayBuffer(1)),
        ],
        refusals,
    });
}
