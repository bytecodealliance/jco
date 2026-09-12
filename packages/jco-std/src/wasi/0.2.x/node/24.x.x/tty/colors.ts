// MIT License

// Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com)

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

// Adapted from nodejs/node v24.20.0, commit
// 71b8b174857e25106d39b61a9e6f30d927da8b01, lib/internal/tty.js.
// Local changes: TypeScript types, ES intrinsics, the default environment comes
// from the terminal provider rather than `process.env`, `process` is read as an
// optional global for the platform check and the deactivated-colors warning, and
// the Windows release probe (which needs `node:os`) resolves to Windows' 16-color
// floor. See ./README.md for runtime boundaries.

import { validateInteger } from "../internal/validation.js";
import type { ColorEnvironment } from "./types.js";

const COLORS_2 = 1;
const COLORS_16 = 4;
const COLORS_256 = 8;
const COLORS_16m = 24;

// Some entries were taken from `dircolors`
// (https://linux.die.net/man/1/dircolors). The corresponding terminals might
// support more than 16 colors, but this was not tested for.
//
// Copyright (C) 1996-2016 Free Software Foundation, Inc. Copying and
// distribution of this file, with or without modification, are permitted
// provided the copyright notice and this notice are preserved.
const TERM_ENVS: Readonly<Record<string, number>> = {
  eterm: COLORS_16,
  cons25: COLORS_16,
  console: COLORS_16,
  cygwin: COLORS_16,
  dtterm: COLORS_16,
  gnome: COLORS_16,
  hurd: COLORS_16,
  jfbterm: COLORS_16,
  konsole: COLORS_16,
  kterm: COLORS_16,
  mlterm: COLORS_16,
  mosh: COLORS_16m,
  putty: COLORS_16,
  st: COLORS_16,
  // http://lists.schmorp.de/pipermail/rxvt-unicode/2016q2/002261.html
  "rxvt-unicode-24bit": COLORS_16m,
  // https://bugs.launchpad.net/terminator/+bug/1030562
  terminator: COLORS_16m,
  "xterm-kitty": COLORS_16m,
};

const CI_ENVS_MAP = new Map<string, number>(
  Object.entries({
    APPVEYOR: COLORS_256,
    BUILDKITE: COLORS_256,
    CIRCLECI: COLORS_16m,
    DRONE: COLORS_256,
    GITEA_ACTIONS: COLORS_16m,
    GITHUB_ACTIONS: COLORS_16m,
    GITLAB_CI: COLORS_256,
    TRAVIS: COLORS_256,
  }),
);

const TERM_ENVS_REG_EXP = [
  /ansi/,
  /color/,
  /linux/,
  /direct/,
  /^con[0-9]*x[0-9]/,
  /^rxvt/,
  /^screen/,
  /^xterm/,
  /^vt100/,
  /^vt220/,
];

interface ProcessGlobal {
  platform?: unknown;
  emitWarning?: unknown;
}

/** The `process` global when one exists; this module never imports `node:process`. */
function processGlobal(): ProcessGlobal | undefined {
  const candidate = (globalThis as { process?: unknown }).process;
  return typeof candidate === "object" && candidate !== null
    ? (candidate as ProcessGlobal)
    : undefined;
}

function hasOwn(env: ColorEnvironment, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(env, name);
}

export interface ColorFunctions {
  getColorDepth(env?: ColorEnvironment): number;
  hasColors(count?: number | ColorEnvironment, env?: ColorEnvironment): boolean;
}

/**
 * Build `getColorDepth` and `hasColors` over a lazily read default environment. Nothing is read
 * from the provider until a call omits `env`, so an explicit environment never touches the host.
 */
export function createColorFunctions(defaultEnvironment: () => ColorEnvironment): ColorFunctions {
  let warned = false;
  function warnOnDeactivatedColors(env: ColorEnvironment): void {
    if (warned) {
      return;
    }
    let name = "";
    if (env.NODE_DISABLE_COLORS !== undefined && env.NODE_DISABLE_COLORS !== "") {
      name = "NODE_DISABLE_COLORS";
    }
    if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") {
      if (name !== "") {
        name += "' and '";
      }
      name += "NO_COLOR";
    }

    if (name !== "") {
      const emitWarning = processGlobal()?.emitWarning;
      if (typeof emitWarning === "function") {
        emitWarning(
          `The '${name}' env is ignored due to the 'FORCE_COLOR' env being set.`,
          "Warning",
        );
      }
      warned = true;
    }
  }

  // The `getColorDepth` API got inspired by multiple sources such as
  // https://github.com/chalk/supports-color,
  // https://github.com/isaacs/color-support.
  function getColorDepth(env: ColorEnvironment = defaultEnvironment()): number {
    // Use level 0-3 to support the same levels as `chalk` does. This is done for
    // consistency throughout the ecosystem.
    if (env.FORCE_COLOR !== undefined) {
      switch (env.FORCE_COLOR) {
        case "":
        case "1":
        case "true":
          warnOnDeactivatedColors(env);
          return COLORS_16;
        case "2":
          warnOnDeactivatedColors(env);
          return COLORS_256;
        case "3":
          warnOnDeactivatedColors(env);
          return COLORS_16m;
        default:
          return COLORS_2;
      }
    }

    if (
      (env.NODE_DISABLE_COLORS !== undefined && env.NODE_DISABLE_COLORS !== "") ||
      // See https://no-color.org/
      (env.NO_COLOR !== undefined && env.NO_COLOR !== "") ||
      // The "dumb" special terminal, as defined by terminfo, doesn't support
      // ANSI color control codes.
      // See https://invisible-island.net/ncurses/terminfo.ti.html#toc-_Specials
      env.TERM === "dumb"
    ) {
      return COLORS_2;
    }

    if (processGlobal()?.platform === "win32") {
      // Node reads the Windows build number from `os.release()` to promote this to 256 colors
      // (build 10586) or 16m colors (build 14931). A component has no `node:os` here, so the
      // answer is Windows' documented floor.
      return COLORS_16;
    }

    if (env.TMUX) {
      return COLORS_16m;
    }

    // Azure DevOps
    if (hasOwn(env, "TF_BUILD") && hasOwn(env, "AGENT_NAME")) {
      return COLORS_16;
    }

    if (hasOwn(env, "CI")) {
      for (const [envName, colors] of CI_ENVS_MAP) {
        if (hasOwn(env, envName)) {
          return colors;
        }
      }
      if (env.CI_NAME === "codeship") {
        return COLORS_256;
      }
      return COLORS_2;
    }

    if ("TEAMCITY_VERSION" in env) {
      return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.exec(env.TEAMCITY_VERSION ?? "") !== null
        ? COLORS_16
        : COLORS_2;
    }

    switch (env.TERM_PROGRAM) {
      case "iTerm.app":
        if (!env.TERM_PROGRAM_VERSION || /^[0-2]\./.exec(env.TERM_PROGRAM_VERSION) !== null) {
          return COLORS_256;
        }
        return COLORS_16m;
      case "HyperTerm":
      case "MacTerm":
        return COLORS_16m;
      case "Apple_Terminal":
        return COLORS_256;
    }

    if (env.COLORTERM === "truecolor" || env.COLORTERM === "24bit") {
      return COLORS_16m;
    }

    if (env.TERM) {
      if (/truecolor/.exec(env.TERM) !== null) {
        return COLORS_16m;
      }

      if (/^xterm-256/.exec(env.TERM) !== null) {
        return COLORS_256;
      }

      const termEnv = env.TERM.toLowerCase();

      if (TERM_ENVS[termEnv]) {
        return TERM_ENVS[termEnv];
      }
      if (TERM_ENVS_REG_EXP.some((term) => term.exec(termEnv) !== null)) {
        return COLORS_16;
      }
    }
    // Move 16 color COLORTERM below 16m and 256
    if (env.COLORTERM) {
      return COLORS_16;
    }
    return COLORS_2;
  }

  function hasColors(count?: number | ColorEnvironment, env?: ColorEnvironment): boolean {
    let colors: number;
    if (
      env === undefined &&
      (count === undefined || (typeof count === "object" && count !== null))
    ) {
      env = count ?? undefined;
      colors = 16;
    } else {
      validateInteger(count, "count", 2);
      colors = count;
    }

    return colors <= 2 ** getColorDepth(env);
  }

  return { getColorDepth, hasColors };
}
