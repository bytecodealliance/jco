import { now } from "wasi:clocks/wall-clock@0.2.3";

export function run() {
    return String(now().seconds);
}
