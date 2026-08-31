import console, { Console, log, warn } from "node:console";

class Capture {
    value = "";

    write(value) {
        this.value += value;
    }
}

export function run() {
    log("guest stdout %d", 24);
    warn("guest stderr");
    console.count("guest");
    console.group("group");
    console.log("nested");
    console.groupEnd();

    const stdout = new Capture();
    const stderr = new Capture();
    const custom = new Console({ stdout, stderr, colorMode: false });
    custom.log("custom %s", "stdout");
    custom.error("custom %s", "stderr");
    custom.assert(false, "assertion %d", 1);
    return `${stdout.value}|${stderr.value}`;
}
