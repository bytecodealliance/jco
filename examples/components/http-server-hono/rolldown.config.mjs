import { defineConfig } from "rolldown";
import typescript from "@rollup/plugin-typescript";

export default defineConfig({
  input: "src/component.ts",
  external: /wasi:.*/,
  output: {
    file: "dist/component.js",
    format: "esm",
  },
    plugins: [typescript({ noEmitOnError: true })],
});
