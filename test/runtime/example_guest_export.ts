import { strictEqual } from "node:assert";

// @ts-ignore
const wasm = await import(
  "../output/example_guest_export/example_guest_export.js"
);

const backend = wasm.backend;
const scalar = new backend.Scalars();
strictEqual(backend.Scalars.getA(), 5);
strictEqual(scalar.getB(), 2);
strictEqual(backend.scalarArg(scalar), 7);
