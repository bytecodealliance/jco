import { WASI as NodeWASI } from "node:wasi";
import { describe, expect, test } from "vitest";
import { createWasi } from "../../../../../../src/wasi/0.2.x/node/24.x.x/wasi/core.js";
import type { WASIOptions } from "../../../../../../src/wasi/0.2.x/node/24.x.x/wasi/types.js";
import { describeDifferential } from "../helpers/assert.js";
import { MISSING_PREOPEN, failureOf, fakeWasiHost } from "../helpers/wasi.js";

/** Option sets Node rejects in JavaScript, before any uvwasi initialisation. */
const INVALID_OPTIONS: Array<[string, unknown]> = [
  ["no options", undefined],
  ["null options", null],
  ["string options", "x"],
  ["array options", []],
  ["missing version", {}],
  ["numeric version", { version: 1 }],
  ["unknown version", { version: "preview2" }],
  ["args not an array", { version: "preview1", args: "x" }],
  ["array-like args", { version: "preview1", args: { length: 1, 0: "x" } }],
  ["env a string", { version: "preview1", env: "x" }],
  ["env null", { version: "preview1", env: null }],
  ["env an array", { version: "preview1", env: [] }],
  ["preopens a number", { version: "preview1", preopens: 1 }],
  ["preopens an array", { version: "preview1", preopens: [] }],
  ["stdin a string", { version: "preview1", stdin: "1" }],
  ["stdin null", { version: "preview1", stdin: null }],
  ["stdin negative", { version: "preview1", stdin: -1 }],
  ["stdin fractional", { version: "preview1", stdin: 1.5 }],
  ["stdin NaN", { version: "preview1", stdin: NaN }],
  ["stdout above int32", { version: "preview1", stdout: 2 ** 31 }],
  ["stderr a bigint", { version: "preview1", stderr: 2n }],
  ["env with a Symbol value", { version: "preview1", env: { A: Symbol("s") } }],
  [
    "args whose toString throws",
    {
      version: "preview1",
      args: [
        {
          toString() {
            throw new Error("custom");
          },
        },
      ],
    },
  ],
  // The version is checked first, then args, env, preopens and the descriptors in that order.
  ["version before args", { version: "nope", args: "x" }],
  ["args before env", { version: "preview1", args: "x", env: "y" }],
  ["env before preopens", { version: "preview1", env: "y", preopens: 1 }],
  ["preopens before stdio", { version: "preview1", preopens: 1, stdin: -1 }],
  ["stdin before stdout", { version: "preview1", stdin: -1, stdout: -1 }],
];

/** Option sets Node rejects only after `uvwasi_init`, so a provider has already been asked. */
const LATE_INVALID_OPTIONS: Array<[string, unknown]> = [
  ["returnOnExit a number", { version: "preview1", returnOnExit: 1 }],
  ["returnOnExit null", { version: "preview1", returnOnExit: null }],
];

describe("new WASI(options)", () => {
  test.each(INVALID_OPTIONS)("rejects %s without touching the provider", (_name, options) => {
    const fake = fakeWasiHost();
    const { WASI } = createWasi(fake.host);
    expect(() => new WASI(options as WASIOptions)).toThrow();
    expect(fake.calls).toEqual([]);
  });

  test.each(LATE_INVALID_OPTIONS)(
    "rejects %s after initialising, as Node does",
    (_name, options) => {
      const fake = fakeWasiHost();
      const { WASI } = createWasi(fake.host);
      expect(failureOf(() => new WASI(options as WASIOptions))?.code).toBe("ERR_INVALID_ARG_TYPE");
      expect(fake.calls).toHaveLength(1);
    },
  );

  test("reports Node's codes and messages for invalid options", () => {
    const { WASI } = createWasi(fakeWasiHost().host);
    expect(failureOf(() => new WASI(undefined as unknown as WASIOptions))).toMatchObject({
      name: "TypeError",
      code: "ERR_INVALID_ARG_TYPE",
      message: 'The "options.version" property must be of type string. Received undefined',
      typeError: true,
    });
    expect(failureOf(() => new WASI(null as unknown as WASIOptions))).toMatchObject({
      code: "ERR_INVALID_ARG_TYPE",
      message: 'The "options" argument must be of type object. Received null',
    });
    expect(failureOf(() => new WASI({ version: "nope" }))).toMatchObject({
      name: "TypeError",
      code: "ERR_INVALID_ARG_VALUE",
      message: "The property 'options.version' unsupported WASI version. Received 'nope'",
    });
    expect(failureOf(() => new WASI({ version: "preview1", args: "x" as never }))).toMatchObject({
      code: "ERR_INVALID_ARG_TYPE",
      message: `The "options.args" property must be an instance of Array. Received type string ('x')`,
    });
    expect(failureOf(() => new WASI({ version: "preview1", env: [] }))).toMatchObject({
      code: "ERR_INVALID_ARG_TYPE",
      message: 'The "options.env" property must be of type object. Received an instance of Array',
    });
    expect(failureOf(() => new WASI({ version: "preview1", stdin: -1 }))).toMatchObject({
      name: "RangeError",
      code: "ERR_OUT_OF_RANGE",
      message:
        'The value of "options.stdin" is out of range. It must be >= 0 && <= 2147483647. Received -1',
      rangeError: true,
    });
    expect(failureOf(() => new WASI({ version: "preview1", stdout: 1.5 }))).toMatchObject({
      code: "ERR_OUT_OF_RANGE",
      message: 'The value of "options.stdout" is out of range. It must be an integer. Received 1.5',
    });
    expect(failureOf(() => new WASI({ version: "preview1", stderr: "2" as never }))).toMatchObject({
      code: "ERR_INVALID_ARG_TYPE",
      message: `The "options.stderr" property must be of type number. Received type string ('2')`,
    });
    expect(
      failureOf(() => new WASI({ version: "preview1", returnOnExit: 1 as never })),
    ).toMatchObject({
      code: "ERR_INVALID_ARG_TYPE",
      message:
        'The "options.returnOnExit" property must be of type boolean. Received type number (1)',
    });
  });

  test("hands the provider the normalised options", () => {
    const fake = fakeWasiHost();
    const { WASI } = createWasi(fake.host);
    new WASI({
      version: "unstable",
      args: ["a", 1, null, undefined, Symbol("s"), { toString: () => "obj" }] as never,
      env: { KEEP: "1", DROP: undefined, NUMBER: 2, NULL: null, OBJECT: { toString: () => "o" } },
      preopens: { "/sandbox": "/tmp", 42: 7 } as never,
      stdin: 3,
      stdout: 4,
      stderr: 5,
    });
    expect(fake.calls).toEqual([
      {
        version: "unstable",
        args: ["a", "1", "null", "undefined", "Symbol(s)", "obj"],
        env: [
          ["KEEP", "1"],
          ["NUMBER", "2"],
          ["NULL", "null"],
          ["OBJECT", "o"],
        ],
        preopens: [
          ["42", "7"],
          ["/sandbox", "/tmp"],
        ],
        stdin: 3,
        stdout: 4,
        stderr: 5,
      },
    ]);
  });

  test("defaults args, env and preopens to empty and stdio to 0, 1, 2", () => {
    const fake = fakeWasiHost();
    const { WASI } = createWasi(fake.host);
    new WASI({ version: "preview1" });
    new WASI({ version: "preview1", stdin: undefined, stdout: undefined, stderr: undefined });
    expect(fake.calls).toEqual(
      Array(2).fill({
        version: "preview1",
        args: [],
        env: [],
        preopens: [],
        stdin: 0,
        stdout: 1,
        stderr: 2,
      }),
    );
  });

  test("validates returnOnExit only after the provider initialised, as Node does", () => {
    const fake = fakeWasiHost(MISSING_PREOPEN);
    const { WASI } = createWasi(fake.host);
    const failure = failureOf(
      () =>
        new WASI({ version: "preview1", returnOnExit: 1 as never, preopens: { "/x": "/nope" } }),
    );
    expect(failure?.code).toBe("UVWASI_ENOENT");
    expect(fake.calls).toHaveLength(1);
  });

  test("rebuilds the provider's uvwasi failure with Node's own fields", () => {
    const { WASI } = createWasi(fakeWasiHost(MISSING_PREOPEN).host);
    expect(failureOf(() => new WASI({ version: "preview1", preopens: { "/x": "/nope" } }))).toEqual(
      {
        name: "Error",
        code: "UVWASI_ENOENT",
        message: "UVWASI_ENOENT, uvwasi_init",
        errno: 44,
        syscall: "uvwasi_init",
        keys: ["errno", "code", "syscall"],
        typeError: false,
        rangeError: false,
      },
    );
  });

  test("accepts a tagged result from the provider", () => {
    const { WASI } = createWasi({
      init: () => ({ tag: "err", val: MISSING_PREOPEN }),
    });
    expect(failureOf(() => new WASI({ version: "preview1" }))?.code).toBe("UVWASI_ENOENT");
    const ok = createWasi({ init: () => ({ tag: "ok", val: undefined }) });
    expect(new ok.WASI({ version: "preview1" })).toBeInstanceOf(ok.WASI);
  });

  test("names the missing adapter and explains why no adapter can run a module", () => {
    const { WASI } = createWasi(
      fakeWasiHost({
        name: "Error",
        message: "node:wasi requires an application-provided host adapter",
        code: "ERR_JCO_WASI_ADAPTER_REQUIRED",
      }).host,
    );
    const failure = failureOf(() => new WASI({ version: "preview1" }));
    expect(failure).toMatchObject({
      name: "Error",
      code: "ERR_JCO_WASI_ADAPTER_REQUIRED",
      keys: ["code"],
    });
    expect(failure?.message).toMatch(
      /^node:wasi requires an application-provided host adapter\. Mapping one only makes construction behave as Node's does: running a module through node:wasi is not supported in a WebAssembly component, because a component cannot instantiate a nested WebAssembly module/,
    );
    expect(failure?.message).toContain("wac or wasm-tools compose");
  });

  test("falls back to ERR_JCO_WASI_HOST for a provider record without a code", () => {
    const { WASI } = createWasi(fakeWasiHost({ name: "Error", message: "host broke" }).host);
    expect(failureOf(() => new WASI({ version: "preview1" }))).toMatchObject({
      code: "ERR_JCO_WASI_HOST",
      message: "host broke",
    });
  });

  test("lets an ordinary error thrown by the provider through unchanged", () => {
    const boom = new RangeError("boom");
    const { WASI } = createWasi({
      init: () => {
        throw boom;
      },
    });
    expect(() => new WASI({ version: "preview1" })).toThrow(boom);
  });
});

describeDifferential("new WASI(options) against Node", () => {
  test.each([...INVALID_OPTIONS, ...LATE_INVALID_OPTIONS])(
    "fails on %s exactly as Node does",
    (_name, options) => {
      const { WASI } = createWasi(fakeWasiHost().host);
      const portable = failureOf(() => new WASI(options as WASIOptions));
      const native = failureOf(() => new NodeWASI(options as WASIOptions));
      expect(portable).toEqual(native);
      expect(portable).not.toBeNull();
    },
  );

  test("accepts what Node accepts", () => {
    const { WASI } = createWasi(fakeWasiHost().host);
    for (const options of [
      { version: "preview1" },
      { version: "unstable" },
      { version: "preview1", args: [1, Symbol("s"), null] as never },
      { version: "preview1", env: { A: undefined, B: null } },
      { version: "preview1", preopens: {} },
      { version: "preview1", returnOnExit: false, stdin: 0, stdout: 1, stderr: 2 },
    ] satisfies WASIOptions[]) {
      expect(failureOf(() => new WASI(options))).toBeNull();
      expect(failureOf(() => new NodeWASI(options))).toBeNull();
    }
  });
});
