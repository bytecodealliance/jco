import { readFileSync, statSync } from "node:fs";

export function inspect(path) {
    return [readFileSync(path, "utf8"), statSync(path).size];
}

export function readError(path) {
    try {
        readFileSync(path);
        return "";
    } catch (error) {
        return error.code;
    }
}
