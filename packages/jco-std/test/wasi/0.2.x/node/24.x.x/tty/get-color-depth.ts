import nodeTty from "node:tty";
import { describe, expect, test, vi } from "vitest";
import { createTty } from "../../../../../../src/wasi/0.2.x/node/24.x.x/tty/core.js";
import { createColorFunctions } from "../../../../../../src/wasi/0.2.x/node/24.x.x/tty/colors.js";
import { fakeTerminal } from "../helpers/tty.js";
import { describeDifferential } from "../helpers/assert.js";

type Env = Record<string, string>;

/** Every branch of Node's `getColorDepth`, in the order the function tests them. */
const environments: Env[] = [
  {},
  { FORCE_COLOR: "" },
  { FORCE_COLOR: "1" },
  { FORCE_COLOR: "true" },
  { FORCE_COLOR: "2" },
  { FORCE_COLOR: "3" },
  { FORCE_COLOR: "0" },
  { FORCE_COLOR: "false" },
  { FORCE_COLOR: "2", TERM: "dumb" },
  { NO_COLOR: "1" },
  { NO_COLOR: "", TERM: "xterm-256color" },
  { NODE_DISABLE_COLORS: "1", COLORTERM: "truecolor" },
  { NODE_DISABLE_COLORS: "", COLORTERM: "truecolor" },
  { TERM: "dumb" },
  { TMUX: "1" },
  { TMUX: "" },
  { TF_BUILD: "", AGENT_NAME: "" },
  { TF_BUILD: "" },
  { CI: "" },
  { CI: "true", GITHUB_ACTIONS: "true" },
  { CI: "true", GITEA_ACTIONS: "true" },
  { CI: "true", CIRCLECI: "true" },
  { CI: "true", TRAVIS: "true" },
  { CI: "true", APPVEYOR: "true" },
  { CI: "true", BUILDKITE: "true" },
  { CI: "true", DRONE: "true" },
  { CI: "true", GITLAB_CI: "true" },
  { CI: "true", CI_NAME: "codeship" },
  { CI: "true", CI_NAME: "other", COLORTERM: "truecolor" },
  { TEAMCITY_VERSION: "9.1.0" },
  { TEAMCITY_VERSION: "9.0.1" },
  { TEAMCITY_VERSION: "10.0" },
  { TEAMCITY_VERSION: "2020.1" },
  { TEAMCITY_VERSION: "" },
  { TERM_PROGRAM: "iTerm.app" },
  { TERM_PROGRAM: "iTerm.app", TERM_PROGRAM_VERSION: "2.9" },
  { TERM_PROGRAM: "iTerm.app", TERM_PROGRAM_VERSION: "3.1" },
  { TERM_PROGRAM: "HyperTerm" },
  { TERM_PROGRAM: "MacTerm" },
  { TERM_PROGRAM: "Apple_Terminal" },
  { TERM_PROGRAM: "vscode", TERM: "xterm" },
  { COLORTERM: "truecolor" },
  { COLORTERM: "24bit" },
  { COLORTERM: "yes" },
  { COLORTERM: "yes", TERM: "unknown" },
  { TERM: "xterm-truecolor" },
  { TERM: "xterm-256color" },
  { TERM: "xterm-256" },
  { TERM: "xterm" },
  { TERM: "XTERM-KITTY" },
  { TERM: "xterm-kitty" },
  { TERM: "konsole" },
  { TERM: "mosh" },
  { TERM: "rxvt-unicode-24bit" },
  { TERM: "rxvt-unicode" },
  { TERM: "terminator" },
  { TERM: "screen-256color" },
  { TERM: "screen" },
  { TERM: "linux" },
  { TERM: "vt100" },
  { TERM: "vt220" },
  { TERM: "con80x25" },
  { TERM: "cons25" },
  { TERM: "ansi" },
  { TERM: "foo-color" },
  { TERM: "foo-direct" },
  { TERM: "unknown" },
  { TERM: "" },
  { TERM: "", COLORTERM: "" },
];

const oracle = nodeTty.WriteStream.prototype.getColorDepth;

describeDifferential("tty.WriteStream#getColorDepth()", () => {
  test.skipIf(process.platform === "win32")("matches Node for every environment branch", () => {
    const tty = createTty(fakeTerminal().host);
    const subject = tty.WriteStream.prototype.getColorDepth;
    for (const env of environments) {
      expect(subject.call(undefined, env), JSON.stringify(env)).toBe(oracle.call(undefined, env));
    }
  });

  test.skipIf(process.platform === "win32")(
    "reads the provider's environment when none is given, once per call",
    () => {
      const terminal = fakeTerminal({ environment: { TERM: "xterm-256color", FORCE_COLOR: "" } });
      const tty = createTty(terminal.host);
      const output = new tty.WriteStream(1);
      expect(output.getColorDepth()).toBe(4);
      expect(terminal.calls.filter((call) => call === "environment()")).toHaveLength(1);
      expect(output.getColorDepth()).toBe(4);
      expect(terminal.calls.filter((call) => call === "environment()")).toHaveLength(2);
      // The host process's own environment answers the same as Node's default.
      const native = fakeTerminal({
        environment: Object.fromEntries(
          Object.entries(process.env).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        ),
      });
      expect(createTty(native.host).WriteStream.prototype.getColorDepth.call(undefined)).toBe(
        oracle.call(undefined),
      );
    },
  );
});

describe("tty.WriteStream#getColorDepth() warnings", () => {
  test("warns once when FORCE_COLOR overrides a deactivation, through the process global", () => {
    const emitWarning = vi.spyOn(process, "emitWarning").mockImplementation(() => undefined);
    try {
      const { getColorDepth } = createColorFunctions(() => ({}));
      expect(getColorDepth({ FORCE_COLOR: "1", NO_COLOR: "1" })).toBe(4);
      expect(getColorDepth({ FORCE_COLOR: "3", NODE_DISABLE_COLORS: "1", NO_COLOR: "1" })).toBe(24);
      expect(emitWarning).toHaveBeenCalledTimes(1);
      expect(emitWarning).toHaveBeenCalledWith(
        "The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.",
        "Warning",
      );
      const fresh = createColorFunctions(() => ({}));
      fresh.getColorDepth({ FORCE_COLOR: "", NODE_DISABLE_COLORS: "1", NO_COLOR: "1" });
      expect(emitWarning).toHaveBeenLastCalledWith(
        "The 'NODE_DISABLE_COLORS' and 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.",
        "Warning",
      );
      fresh.getColorDepth({ FORCE_COLOR: "1", NO_COLOR: "" });
      expect(emitWarning).toHaveBeenCalledTimes(2);
    } finally {
      emitWarning.mockRestore();
    }
  });

  test("never reads the provider when an environment is passed", () => {
    const reads: number[] = [];
    const { getColorDepth } = createColorFunctions(() => {
      reads.push(1);
      return { TERM: "dumb" };
    });
    expect(getColorDepth({ TERM: "xterm-256color" })).toBe(8);
    expect(reads).toEqual([]);
    expect(getColorDepth()).toBe(1);
    expect(reads).toEqual([1]);
  });
});
