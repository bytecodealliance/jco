// The path algorithms in this module follow Node.js' `lib/path.js` behavior.
// Node.js is distributed under the MIT license. See https://github.com/nodejs/node.
export type InitialCwd = () => string | undefined;
export type GetEnvironment = () => Array<[string, string]>;

export interface PathProviders {
  initialCwd: InitialCwd;
  getEnvironment: GetEnvironment;
}

export interface ParsedPath {
  root: string;
  dir: string;
  base: string;
  ext: string;
  name: string;
}

export interface FormatInputPathObject {
  root?: string;
  dir?: string;
  base?: string;
  ext?: string;
  name?: string;
}

export interface PathModule {
  resolve(...paths: string[]): string;
  normalize(path: string): string;
  isAbsolute(path: string): boolean;
  join(...paths: string[]): string;
  relative(from: string, to: string): string;
  toNamespacedPath(path: string): string;
  dirname(path: string): string;
  basename(path: string, suffix?: string): string;
  extname(path: string): string;
  format(pathObject: FormatInputPathObject): string;
  parse(path: string): ParsedPath;
  matchesGlob(path: string, pattern: string): boolean;
  readonly sep: string;
  readonly delimiter: string;
  posix: PathModule;
  win32: PathModule;
}

function string(value: unknown, name = "path"): asserts value is string {
  if (typeof value !== "string") {
    throw new TypeError(`${name} must be a string`);
  }
}

function object(value: unknown): asserts value is FormatInputPathObject {
  if (value === null || typeof value !== "object") {
    throw new TypeError("pathObject must be an object");
  }
}

function cwd(providers: PathProviders): string {
  const value = providers.initialCwd();
  if (value === undefined) {
    throw new Error("node:path requires wasi:cli/environment initial-cwd");
  }
  string(value, "initialCwd");
  return value;
}

function normalizeParts(
  path: string,
  allowAboveRoot: boolean,
  separator: string,
  isSeparator: (c: string) => boolean,
) {
  const parts: string[] = [];
  for (const part of path.split(isSeparator === posixSeparator ? "/" : /[\\/]/)) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      if (parts.length && parts[parts.length - 1] !== "..") {
        parts.pop();
      } else if (allowAboveRoot) {
        parts.push("..");
      }
    } else {
      parts.push(part);
    }
  }
  return parts.join(separator);
}

const posixSeparator = (c: string) => c === "/";
const winSeparator = (c: string) => c === "/" || c === "\\";

function formatPath(separator: string, value: FormatInputPathObject) {
  object(value);
  const dir = value.dir || value.root || "";
  const ext = value.ext ? (value.ext.startsWith(".") ? value.ext : `.${value.ext}`) : "";
  const base = value.base || `${value.name || ""}${ext}`;
  if (!dir) {
    return base;
  }
  return dir === value.root ? `${dir}${base}` : `${dir}${separator}${base}`;
}

function createPosix(providers: PathProviders): PathModule {
  const api: PathModule = {
    resolve(...paths: string[]) {
      let resolved = "";
      let absolute = false;
      for (let i = paths.length - 1; i >= -1 && !absolute; i--) {
        const path = i >= 0 ? paths[i] : cwd(providers);
        string(path);
        if (!path) {
          continue;
        }
        resolved = `${path}/${resolved}`;
        absolute = path.charCodeAt(0) === 47;
      }
      const normalized = normalizeParts(resolved, !absolute, "/", posixSeparator);
      return absolute ? `/${normalized}` : normalized || ".";
    },
    normalize(path: string) {
      string(path);
      if (!path) {
        return ".";
      }
      const absolute = path.startsWith("/");
      const trailing = path.endsWith("/");
      let result = normalizeParts(path, !absolute, "/", posixSeparator);
      if (!result && !absolute) {
        result = ".";
      }
      if (result && trailing) {
        result += "/";
      }
      return `${absolute ? "/" : ""}${result}`;
    },
    isAbsolute(path: string) {
      string(path);
      return path.startsWith("/");
    },
    join(...paths: string[]) {
      if (paths.length === 0) {
        return ".";
      }
      for (const path of paths) {
        string(path);
      }
      return api.normalize(paths.filter(Boolean).join("/"));
    },
    relative(from: string, to: string) {
      string(from, "from");
      string(to, "to");
      const a = api.resolve(from);
      const b = api.resolve(to);
      if (a === b) {
        return "";
      }
      const af = a.slice(1).split("/");
      const bf = b.slice(1).split("/");
      let i = 0;
      while (i < af.length && af[i] === bf[i]) {
        i++;
      }
      return [...af.slice(i).map(() => ".."), ...bf.slice(i)].join("/");
    },
    toNamespacedPath(path: string) {
      string(path);
      return path;
    },
    dirname(path: string) {
      string(path);
      if (!path) {
        return ".";
      }
      let end = -1;
      let root = false;
      for (let i = path.length - 1; i >= 1; i--) {
        if (path.charCodeAt(i) === 47) {
          if (end === -1) {
            continue;
          }
          return path.slice(0, i) || "/";
        }
        end = i;
      }
      if (path.charCodeAt(0) === 47) {
        root = true;
      }
      return root ? "/" : ".";
    },
    basename(path: string, suffix?: string) {
      string(path);
      if (suffix !== undefined) {
        string(suffix, "suffix");
      }
      let end = path.length;
      while (end > 0 && path.charCodeAt(end - 1) === 47) {
        end--;
      }
      const start = path.lastIndexOf("/", end - 1) + 1;
      let base = path.slice(start, end);
      if (suffix && suffix.length <= base.length && base.endsWith(suffix)) {
        base = base.slice(0, -suffix.length);
      }
      return base;
    },
    extname(path: string) {
      string(path);
      const base = api.basename(path);
      const dot = base.lastIndexOf(".");
      if (dot <= 0 || (dot === 1 && base[0] === ".")) {
        return "";
      }
      return base.slice(dot);
    },
    format(value: FormatInputPathObject) {
      return formatPath("/", value);
    },
    parse(path: string): ParsedPath {
      string(path);
      const root = path.startsWith("/") ? "/" : "";
      const dir = api.dirname(path);
      const base = api.basename(path);
      const ext = api.extname(base);
      return {
        root,
        dir: dir === "." && !path.includes("/") ? "" : dir,
        base,
        ext,
        name: base.slice(0, base.length - ext.length),
      };
    },
    matchesGlob(path: string, pattern: string) {
      string(path);
      string(pattern, "pattern");
      return glob(path, pattern, false);
    },
    sep: "/",
    delimiter: ":",
    posix: undefined as unknown as PathModule,
    win32: undefined as unknown as PathModule,
  };
  return api;
}

function glob(path: string, pattern: string, windows: boolean) {
  if (windows) {
    path = path.replaceAll("\\", "/");
    pattern = pattern.replaceAll("\\", "/");
  }
  let source = "^";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "*") {
      if (pattern[i + 1] === "*") {
        i++;
        if (pattern[i + 1] === "/") {
          i++;
          source += "(?:.*/)?";
        } else {
          source += ".*";
        }
      } else {
        source += "[^/]*";
      }
    } else if (char === "?") {
      source += "[^/]";
    } else if (char === "[") {
      const end = pattern.indexOf("]", i + 1);
      if (end < 0) {
        source += "\\[";
      } else {
        source += pattern.slice(i, end + 1);
        i = end;
      }
    } else if (char === "{") {
      const end = pattern.indexOf("}", i + 1);
      if (end < 0) {
        source += "\\{";
      } else {
        source += `(?:${pattern
          .slice(i + 1, end)
          .split(",")
          .map((part) => part.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&"))
          .join("|")})`;
        i = end;
      }
    } else {
      source += char.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
    }
  }
  return new RegExp(`${source}$`).test(path);
}

function createWin32(providers: PathProviders): PathModule {
  const rootOf = (path: string) => {
    const unc = /^[\\/]{2}([^\\/]+)[\\/]([^\\/]+)[\\/]?/.exec(path);
    if (unc) {
      return {
        root: `\\\\${unc[1]}\\${unc[2]}\\`,
        device: `\\\\${unc[1]}\\${unc[2]}`,
        end: unc[0].length,
        absolute: true,
      };
    }
    const drive = /^([a-zA-Z]:)([\\/]?)/.exec(path);
    if (drive) {
      return {
        root: drive[2] ? `${drive[1]}\\` : drive[1],
        device: drive[1],
        end: drive[0].length,
        absolute: !!drive[2],
      };
    }
    const absolute = winSeparator(path[0]);
    return { root: absolute ? "\\" : "", device: "", end: absolute ? 1 : 0, absolute };
  };
  const api: PathModule = {
    resolve(...paths: string[]) {
      let device = "";
      let tail = "";
      let absolute = false;
      for (let i = paths.length - 1; i >= -1; i--) {
        let path: string;
        if (i >= 0) {
          path = paths[i];
        } else if (!device) {
          path = cwd(providers);
        } else {
          const env = providers
            .getEnvironment()
            .find(([key]) => key.toUpperCase() === `=${device.toUpperCase()}`)?.[1];
          const initial = env || cwd(providers);
          path = initial.toUpperCase().startsWith(device.toUpperCase()) ? initial : `${device}\\`;
        }
        string(path);
        if (!path) {
          continue;
        }
        const root = rootOf(path);
        if (root.device && device && root.device.toLowerCase() !== device.toLowerCase()) {
          continue;
        }
        if (!device) {
          device = root.device;
        }
        if (!absolute) {
          tail = `${path.slice(root.end)}\\${tail}`;
          absolute = root.absolute;
        }
        if (absolute && device) {
          break;
        }
      }
      const normalized = normalizeParts(tail, !absolute, "\\", winSeparator);
      return `${device}${absolute ? "\\" : ""}${normalized}` || ".";
    },
    normalize(path: string) {
      string(path);
      if (!path) {
        return ".";
      }
      const info = rootOf(path);
      const trailing = winSeparator(path[path.length - 1]);
      let tail = normalizeParts(path.slice(info.end), !info.absolute, "\\", winSeparator);
      if (!tail && !info.absolute) {
        tail = ".";
      }
      if (tail && trailing) {
        tail += "\\";
      }
      return `${info.root}${tail}`;
    },
    isAbsolute(path: string) {
      string(path);
      return rootOf(path).absolute;
    },
    join(...paths: string[]) {
      if (!paths.length) {
        return ".";
      }
      for (const path of paths) {
        string(path);
      }
      return api.normalize(paths.filter(Boolean).join("\\"));
    },
    relative(from: string, to: string) {
      string(from, "from");
      string(to, "to");
      const a = api.resolve(from);
      const b = api.resolve(to);
      if (a.toLowerCase() === b.toLowerCase()) {
        return "";
      }
      const ar = rootOf(a);
      const br = rootOf(b);
      if (ar.device.toLowerCase() !== br.device.toLowerCase()) {
        return b;
      }
      const af = a.slice(ar.end).split("\\");
      const bf = b.slice(br.end).split("\\");
      let i = 0;
      while (i < af.length && af[i].toLowerCase() === bf[i].toLowerCase()) {
        i++;
      }
      return [...af.slice(i).map(() => ".."), ...bf.slice(i)].join("\\");
    },
    toNamespacedPath(path: string) {
      string(path);
      if (!path) {
        return path;
      }
      const resolved = api.resolve(path);
      if (resolved.startsWith("\\\\")) {
        return `\\\\?\\UNC\\${resolved.slice(2)}`;
      }
      if (/^[a-zA-Z]:\\/.test(resolved)) {
        return `\\\\?\\${resolved}`;
      }
      return path;
    },
    dirname(path: string) {
      string(path);
      if (!path) {
        return ".";
      }
      const info = rootOf(path);
      let end = path.length;
      while (end > info.end && winSeparator(path[end - 1])) {
        end--;
      }
      while (end > info.end && !winSeparator(path[end - 1])) {
        end--;
      }
      while (end > info.end && winSeparator(path[end - 1])) {
        end--;
      }
      return end === 0 ? "." : path.slice(0, end) || info.root || ".";
    },
    basename(path: string, suffix?: string) {
      string(path);
      if (suffix !== undefined) {
        string(suffix, "suffix");
      }
      let end = path.length;
      while (end && winSeparator(path[end - 1])) {
        end--;
      }
      let start = end;
      while (start && !winSeparator(path[start - 1]) && path[start - 1] !== ":") {
        start--;
      }
      let base = path.slice(start, end);
      if (suffix && base.endsWith(suffix)) {
        base = base.slice(0, -suffix.length);
      }
      return base;
    },
    extname(path: string) {
      string(path);
      const base = api.basename(path);
      const dot = base.lastIndexOf(".");
      return dot <= 0 || (dot === 1 && base[0] === ".") ? "" : base.slice(dot);
    },
    format(value) {
      return formatPath("\\", value);
    },
    parse(path: string) {
      string(path);
      const info = rootOf(path);
      const dir = api.dirname(path);
      const base = api.basename(path);
      const ext = api.extname(base);
      return {
        root: info.root,
        dir: dir === "." && !/[\\/:]/.test(path) ? "" : dir,
        base,
        ext,
        name: base.slice(0, -ext.length || undefined),
      };
    },
    matchesGlob(path, pattern) {
      string(path);
      string(pattern, "pattern");
      return glob(path, pattern, true);
    },
    sep: "\\",
    delimiter: ";",
    posix: undefined as unknown as PathModule,
    win32: undefined as unknown as PathModule,
  };
  return api;
}

export function createPath(providers: PathProviders): PathModule {
  if (
    !providers ||
    typeof providers.initialCwd !== "function" ||
    typeof providers.getEnvironment !== "function"
  ) {
    throw new TypeError("createPath requires initialCwd and getEnvironment providers");
  }
  const posix = createPosix(providers);
  const win32 = createWin32(providers);
  posix.posix = posix;
  posix.win32 = win32;
  win32.posix = posix;
  win32.win32 = win32;
  return posix;
}
