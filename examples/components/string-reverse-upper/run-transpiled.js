/**
 * If this import listed below is missing, please run
 *
 * ```
 * npm run build && npm run compose && npm run transpile`
 * ```
 */
import { reversedUpper } from "./dist/transpiled/string-reverse-upper.mjs";

const result = reversedUpper.reverseAndUppercase("!dlroW olleH");

console.log(`reverseAndUppercase('!dlroW olleH') = ${result}`);
