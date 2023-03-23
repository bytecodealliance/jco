module.exports = {
    "env": {
        "browser": true,
        "es2021": true,
        "node": true
    },
    "extends": "eslint:recommended",
    "parserOptions": {
        "ecmaVersion": 13,
        "sourceType": "module"
    },
    "rules": {
      "no-sparse-arrays": 0,
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
    }
};
