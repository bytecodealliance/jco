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
    "scope-enum": [1, "always", ["jco", "bindgen", "p2-shim"]],
    "scope-case": [2, "always", "kebab-case"],
  },
};

export default config;
