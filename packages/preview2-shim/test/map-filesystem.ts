import { createMapFilesystemShim } from "./fixtures/filesystem-shim/in-memory-map.js";
import { testFilesystemImplementation } from "./filesystem-conformance.js";

const browserFilesystem = await import("../src/browser/filesystem.js");

testFilesystemImplementation("Map-backed browser filesystem example", () => ({
    filesystem: createMapFilesystemShim(browserFilesystem),
    preopens: { "/data": "data" },
}));
