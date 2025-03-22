import prettier from "eslint-plugin-prettier";
import { default as prettierConfig } from "./prettier.mjs";

const config = {
  plugins: {
    prettier,
  },
  rules: {
    "no-sparse-arrays": 0,
    "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "no-fallthrough": 0,
    "no-constant-condition": 0,
    "prettier/prettier": ["error", prettierConfig],
  },
};

export default config;
