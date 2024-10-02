// If this import listed below is missing, please run `npm run transpile`
import { reverse } from "./dist/transpiled/string-reverse.mjs";

const reversed = reverse.reverseString("!dlroW olleH");

console.log(`reverseString('!dlroW olleH') = ${reversed}`);
