import {
    appendFileSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    renameSync,
    rmdirSync,
    statSync,
    unlinkSync,
    writeFileSync,
} from "node:fs";

// Perry lowers these Node-style APIs to WASI P2. The host supplies every input
// after compilation and independently checks the resulting files and directories.
const input: string = readFileSync("/data/input.txt", "utf8");

// Keep this first: the default shim must reject Rust's mutate-directory request
// for a writable regular file before truncation or any directory changes occur.
writeFileSync("/data/existing.txt", "new");
mkdirSync("/data/work");
writeFileSync("/data/work/created.txt", input);
appendFileSync("/data/work/created.txt", "appended\n");
console.log(`Perry contents: ${readFileSync("/data/work/created.txt", "utf8")}`);
console.log(`Perry size: ${statSync("/data/work/created.txt").size}`);
renameSync("/data/work/created.txt", "/data/work/renamed.txt");
console.log(`Perry entries: ${readdirSync("/data/work").join(",")}`);
unlinkSync("/data/remove-me.txt");
mkdirSync("/data/work/empty");
rmdirSync("/data/work/empty");
console.log("Perry mutations complete");
