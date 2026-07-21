import { strict as assert } from "node:assert";
import { run } from "./dist/transpiled/component.js";

assert.equal(run.run(), undefined);
