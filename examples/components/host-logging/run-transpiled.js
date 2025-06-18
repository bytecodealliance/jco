// If this import listed below is missing, please run `npm run transpile`
import { logCharacters } from "./dist/transpiled/component.js";

// this will print Hello world! with each character on a new line
logCharacters.call("Hello world!");
