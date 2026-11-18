// Setup of the "performance" test project: turns on every `performance` option
// of the Node.js filesystem for preopens that are created without their own.
import { filesystem } from "@bytecodealliance/preview2-shim";

filesystem._setPerformance({ mainThreadFilesystem: true });
