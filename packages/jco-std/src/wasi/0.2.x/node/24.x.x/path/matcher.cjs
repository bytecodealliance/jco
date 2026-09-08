// brace-expansion initializes escape tokens with Math.random(). Keep its load
// inside the call so bundlers defer that initialization until matchesGlob runs,
// when WASI random imports are available, instead of during Wizer initialization.
// CommonJS preserves synchronous loading for Node's synchronous matchesGlob API.

/**
 * @param {string} pattern
 * @param {import("minimatch").MinimatchOptions} options
 * @returns {import("minimatch").Minimatch}
 */
exports.createMatcher = function createMatcher(pattern, options) {
  // oxlint-disable-next-line typescript/no-require-imports -- defer synchronous dependency initialization
  const { Minimatch } = require("minimatch");
  return new Minimatch(pattern, options);
};
