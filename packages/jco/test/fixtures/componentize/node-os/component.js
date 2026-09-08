import os, { arch, availableParallelism, platform, userInfo } from "node:os";

function errorFields(invoke) {
    try {
        invoke();
        return null;
    } catch (error) {
        return {
            name: error.name,
            code: error.code,
            syscall: error.syscall,
            info: error.info,
        };
    }
}

export function run(denied) {
    const staticProperties = {
        eol: os.EOL,
        devNull: os.devNull,
        invalidArgument: os.constants.errno.EINVAL,
    };
    if (denied) {
        return JSON.stringify({
            ...staticProperties,
            errors: [arch, platform, userInfo, os.loadavg, os.type, os.uptime].map(errorFields),
        });
    }
    const user = userInfo();
    return JSON.stringify({
        ...staticProperties,
        namespaceIdentity: os.arch === arch,
        arch: arch(),
        platform: platform(),
        parallelism: availableParallelism(),
        username: user.username,
        homedir: user.homedir,
        type: os.type(),
        loadavg: os.loadavg(),
        uptime: os.uptime(),
        bufferedUsername: userInfo({ encoding: "buffer" }).username.toString(),
        priorityError: errorFields(() => os.getPriority(2147483647)),
    });
}
