import nodeResolve from "@rollup/plugin-node-resolve";
import commonjs from '@rollup/plugin-commonjs';
import alias from '@rollup/plugin-alias';
import inject from '@rollup/plugin-inject';
import { defineEnv } from "unenv";

const { env } = defineEnv({});

export default {
  input: "index.js",
  external: /wasi:.*/,
  output: {
    file: "dist/component.js",
    format: "esm",
    inlineDynamicImports: true,
  },
  plugins: [
    inject(env.inject),
    alias({
      entries: env.alias,
    }),
    commonjs(),
    nodeResolve(),
  ],
};
