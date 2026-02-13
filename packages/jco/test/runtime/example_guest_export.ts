import { strictEqual } from "node:assert";

// @ts-ignore
import * as wasm from "../output/example_guest_export/example_guest_export.js";

const backend = wasm.backend;
const scalar = new backend.Scalars();
strictEqual(backend.Scalars.getA(), 5);
strictEqual(scalar.getB(), 2);
strictEqual(backend.scalarArg(scalar), 7);
