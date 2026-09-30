import { lstatSync, readlinkSync, statSync } from "node:fs";

import { beforeEach, expect, test, vi } from "vitest";

vi.mock("node:process", async (importOriginal) => ({
    ...(await importOriginal<typeof import("node:process")>()),
    platform: "win32",
}));
vi.mock("node:fs", async (importOriginal) => ({
    ...(await importOriginal<typeof import("node:fs")>()),
    statSync: vi.fn(),
    lstatSync: vi.fn(),
    readlinkSync: vi.fn(),
    realpathSync: vi.fn((path: string) => path),
}));
vi.mock("../src/io/worker-io.js", () => ({
    earlyDispose: vi.fn(),
    inputStreamCreate: vi.fn(),
    ioCall: vi.fn(),
    outputStreamCreate: vi.fn(),
    registerDispose: vi.fn(),
}));

import { ioCall, registerDispose } from "../src/io/worker-io.js";

import { _createPreopenDescriptor } from "../src/nodejs/filesystem.js";

beforeEach(() => {
    vi.clearAllMocks();
    const stats = {
        isFile: () => true,
        isDirectory: () => false,
        isSymbolicLink: () => false,
        nlink: 1n,
        size: 0n,
        atimeNs: 0n,
        mtimeNs: 0n,
        ctimeNs: 0n,
    } as ReturnType<typeof statSync>;
    vi.mocked(statSync).mockReturnValue(stats);
    vi.mocked(lstatSync).mockReturnValue(stats);
});

for (const symlinkFollow of [false, true]) {
    test.each([
        ["C:\\Users\\test\\app.wit", "//?/C:/Users/test/app.wit"],
        ["C:/Users/test/app.wit", "//?/C:/Users/test/app.wit"],
        ["?/C:/Users/test/app.wit", "//?/C:/Users/test/app.wit"],
        ["server/share/app.wit", "//server/share/app.wit"],
    ])(`Windows root resolves %s (follow=${symlinkFollow})`, (path, expected) => {
        const root = _createPreopenDescriptor("/");
        root.statAt({ symlinkFollow }, path);
        expect(symlinkFollow ? statSync : lstatSync).toHaveBeenCalledWith(expected, {
            bigint: true,
        });
    });
}

test("Windows drive normalization does not replace an explicit preopen", () => {
    const root = _createPreopenDescriptor("D:/sandbox");
    root.statAt({}, "C:/outside/app.wit");
    expect(lstatSync).toHaveBeenCalledWith("D:/sandbox/C:/outside/app.wit", { bigint: true });
});

test("Windows readlink targets use WASI path separators", () => {
    vi.mocked(readlinkSync).mockReturnValue("nested\\target.txt");
    const root = _createPreopenDescriptor("C:/sandbox");
    expect(root.readlinkAt("link.txt")).toBe("nested/target.txt");
});

for (const read of [false, true]) {
    test(`rejects a writable Windows directory without opening it (read=${read})`, () => {
        vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as ReturnType<
            typeof statSync
        >);
        const root = _createPreopenDescriptor("C:/sandbox");
        expect(() => root.openAt({}, ".", { directory: true }, { read, write: true })).toThrow(
            "is-directory",
        );
        expect(ioCall).not.toHaveBeenCalled();
        expect(registerDispose).not.toHaveBeenCalled();
    });
}

test("reads a Windows directory without opening it as a file", () => {
    vi.mocked(statSync).mockReturnValue({
        isDirectory: () => true,
        isFile: () => false,
        isSocket: () => false,
        isSymbolicLink: () => false,
        isFIFO: () => false,
        isCharacterDevice: () => false,
        isBlockDevice: () => false,
        nlink: 1n,
        size: 0n,
        atimeNs: 0n,
        mtimeNs: 1n,
        ctimeNs: 0n,
        ino: 2n,
    } as ReturnType<typeof statSync>);
    const root = _createPreopenDescriptor("C:/sandbox");
    const directory = root.openAt({}, ".", { directory: true }, { read: true });
    expect(directory.getType()).toBe("directory");
    expect(directory.stat().type).toBe("directory");
    expect(directory.metadataHash()).toEqual({ upper: 1n, lower: 2n });
    expect(ioCall).not.toHaveBeenCalled();
    expect(registerDispose).not.toHaveBeenCalled();
});
