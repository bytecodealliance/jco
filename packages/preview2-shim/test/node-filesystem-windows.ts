import { lstatSync, statSync } from "node:fs";

import { beforeEach, expect, test, vi } from "vitest";

vi.mock("node:process", async (importOriginal) => ({
    ...(await importOriginal<typeof import("node:process")>()),
    platform: "win32",
}));
vi.mock("node:fs", async (importOriginal) => ({
    ...(await importOriginal<typeof import("node:fs")>()),
    statSync: vi.fn(),
    lstatSync: vi.fn(),
}));
vi.mock("../src/io/worker-io.js", () => ({
    earlyDispose: vi.fn(),
    inputStreamCreate: vi.fn(),
    ioCall: vi.fn(),
    outputStreamCreate: vi.fn(),
    registerDispose: vi.fn(),
}));

import { FILESYSTEM_DESCRIPTOR_CLOSE } from "../src/io/calls.js";
import { ioCall, registerDispose } from "../src/io/worker-io.js";

import { _createPreopenDescriptor } from "../src/nodejs/filesystem.js";

beforeEach(() => {
    vi.clearAllMocks();
    const stats = {
        isFile: () => true,
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

for (const read of [false, true]) {
    test(`rejects a writable Windows directory and closes its handle (read=${read})`, () => {
        vi.mocked(ioCall).mockReturnValue({ id: 42, type: "directory" });
        const root = _createPreopenDescriptor("C:/sandbox");
        expect(() => root.openAt({}, ".", { directory: true }, { read, write: true })).toThrow(
            "is-directory",
        );
        expect(ioCall).toHaveBeenLastCalledWith(FILESYSTEM_DESCRIPTOR_CLOSE, 42);
        expect(registerDispose).not.toHaveBeenCalled();
    });
}

test("still permits read-only Windows directory handles", () => {
    vi.mocked(ioCall).mockReturnValue({ id: 42, type: "directory" });
    const root = _createPreopenDescriptor("C:/sandbox");
    expect(() => root.openAt({}, ".", { directory: true }, { read: true })).not.toThrow();
    expect(ioCall).not.toHaveBeenCalledWith(FILESYSTEM_DESCRIPTOR_CLOSE, 42);
    expect(registerDispose).toHaveBeenCalled();
});
