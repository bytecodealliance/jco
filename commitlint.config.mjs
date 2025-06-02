const config = {
  extends: ["@commitlint/config-conventional"],
  parserPreset: "conventional-changelog-conventionalcommits",
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "build",
        "chore",
        "ci",
        "debug",
        "docs",
        "feat",
        "fix",
        "perf",
        "refactor",
        "release",
        "revert",
        "style",
        "test",
      ],
    ],
    "scope-enum": [1, "always", ["jco", "bindgen", "p2-shim", "deps", "ci"]],
    "scope-case": [2, "always", "lower-case"],
  },
};

export default config;
