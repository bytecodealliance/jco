import process, {
    env,
    argv,
    cwd,
    chdir,
    cpuUsage,
    memoryUsage,
    resourceUsage,
    hrtime,
    nextTick,
    report,
    allowedNodeEnvironmentFlags,
} from "node:process";
import * as namespace from "node:process";

function errorOf(fn) {
    try {
        fn();
        return null;
    } catch (error) {
        return { name: error.name, code: error.code, message: error.message, syscall: error.syscall };
    }
}
function runChecks(mode) {
    if (mode === "denied") {
        return JSON.stringify({
            errors: [
                () => process.pid,
                cwd,
                memoryUsage,
                hrtime.bigint,
                () => env.JCO_PROCESS_E2E,
                () => process.kill(1, 0),
                () => report.getReport(),
            ].map(errorOf),
        });
    }
    const key = "JCO_PROCESS_E2E";
    env[key] = "guest";
    const environment = {
        value: env[key],
        enumerable: Object.keys(env).includes(key),
        descriptor: Object.getOwnPropertyDescriptor(env, key).value,
    };
    delete env[key];
    environment.deleted = env[key] === undefined;
    const initial = hrtime();
    const currentDirectory = cwd();
    chdir(currentDirectory);
    const oldCode = process.exitCode;
    let exitCode;
    try {
        process.exitCode = "7";
        exitCode = process.exitCode;
    } finally {
        process.exitCode = oldCode;
    }
    const usage = memoryUsage();
    const resources = resourceUsage();
    const nativeReport = report.getReport();
    const events = [];
    process.once("guest-event", (value) => events.push(value));
    process.emit("guest-event", "once");
    process.emit("guest-event", "ignored");
    return JSON.stringify({
        identity:
            namespace.default === process &&
            process.on === process.addListener &&
            process.off === process.removeListener &&
            process.env === env &&
            process.argv === argv &&
            process.cwd === cwd &&
            process.memoryUsage === memoryUsage &&
            process.report === report &&
            process.nextTick === nextTick,
        pid: process.pid,
        ppid: process.ppid,
        arch: process.arch,
        platform: process.platform,
        version: process.version,
        argv: [...argv],
        cwd: currentDirectory,
        environment,
        events,
        cpu: cpuUsage(),
        memory: usage,
        rss: memoryUsage.rss(),
        resources,
        time: hrtime(initial),
        bigint: String(hrtime.bigint()),
        uptime: process.uptime(),
        available: process.availableMemory(),
        constrained: process.constrainedMemory(),
        signalZero: process.kill(process.pid, 0),
        exitCode,
        ids:
            process.platform === "win32"
                ? null
                : {
                      uid: process.getuid(),
                      euid: process.geteuid(),
                      gid: process.getgid(),
                      egid: process.getegid(),
                      groups: process.getgroups(),
                  },
        reportPid: nativeReport.header.processId,
        flag: allowedNodeEnvironmentFlags.has("--trace-warnings"),
        flagsSize: allowedNodeEnvironmentFlags.size,
        missingDirectory: errorOf(() => chdir("/jco-process-nonexistent-directory")),
        unknownSignal: errorOf(() => process.kill(process.pid, "JCO_BAD_SIGNAL")),
        deprecated: errorOf(() => process.umask()),
        unsupported: errorOf(() => process.on("exit", () => {})),
    });
}
export function terminate(code) {
    process.exit(code);
}

export function run(mode) {
    try {
        return runChecks(mode);
    } catch (error) {
        return JSON.stringify({
            failure: { name: error.name, message: error.message, code: error.code, stack: error.stack },
        });
    }
}

export async function tick() {
    const order = ["sync"];
    await new Promise((resolve) =>
        nextTick(
            (value, number) => {
                order.push(value + number);
                resolve();
            },
            "tick",
            2,
        ),
    );
    return JSON.stringify(order);
}
