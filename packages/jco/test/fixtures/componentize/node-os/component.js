import os, { arch, availableParallelism, platform, userInfo } from "node:os";

export function run() {
    const user = userInfo();
    return JSON.stringify({
        namespaceIdentity: os.arch === arch,
        arch: arch(),
        platform: platform(),
        parallelism: availableParallelism(),
        username: user.username,
        homedir: user.homedir,
        eol: os.EOL,
        devNull: os.devNull,
    });
}
