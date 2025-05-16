import typescript from "@rollup/plugin-typescript";
import nodeResolve from "@rollup/plugin-node-resolve";

export default {
  input: "src/component.ts",
  external: /wasi:.*/,
  output: {
    file: "dist/component.js",
    format: "esm",
  },
  plugins: [typescript({ noEmitOnError: true }), nodeResolve()],
};
