const config = {
  extends: ["@commitlint/config-conventional"],
  parserPreset: "conventional-changelog-conventionalcommits",
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "build",
        "debug",
        "chore",
        "ci",
        "docs",
        "feat",
        "fix",
        "perf",
        "refactor",
        "revert",
        "style",
        "test",
      ],
    ],
    "scope-enum": [1, "always", ["jco", "bindgen", "p2-shim"]],
    "scope-case": [2, "always", "kebab-case"],
  },
};

export default config;
