import fs, { closeSync, openSync, readFile, readFileSync, readSync, writeFileSync } from "node:fs";
import { appendFile, readFile as readFilePromise } from "node:fs/promises";

function readWithCallback(path) {
    return new Promise((resolve, reject) => {
        readFile(path, "utf8", (error, contents) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(contents);
        });
    });
}

export async function run(root) {
    const directory = `${root}/guest-fs`;
    const file = `${directory}/message.txt`;
    fs.mkdirSync(directory);
    writeFileSync(file, "sync");

    const syncContents = readFileSync(file, "utf8");
    const callbackContents = await readWithCallback(file);
    await appendFile(file, " + promise");
    const promiseContents = await readFilePromise(file, "utf8");

    const descriptor = openSync(file, "r");
    const bytes = new Uint8Array(4);
    const bytesRead = readSync(descriptor, bytes, 0, bytes.length, 0);
    closeSync(descriptor);

    return {
        syncContents,
        callbackContents,
        promiseContents,
        descriptorContents: new TextDecoder().decode(bytes.subarray(0, bytesRead)),
        isFile: fs.statSync(file).isFile(),
        entries: fs.readdirSync(directory).join(","),
    };
}
