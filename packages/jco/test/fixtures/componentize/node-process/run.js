import nativeProcess from "node:process";
import { pathToFileURL } from "node:url";
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";
const { instantiate } = await import(pathToFileURL(nativeProcess.argv[2]));
const specifier = nativeProcess.argv[3];
const host = await import(specifier);
const instance = await instantiate(undefined, { ...new WASIShim().getImportObject(), [specifier]: host });
if (nativeProcess.argv[4] === "exit") {
    await instance.terminate(23);
    throw new Error("process.exit returned");
}
const guest = JSON.parse(await instance.run(nativeProcess.argv[4]));
// QuickJS currently rejects Promise-returning exports for synchronous WIT functions.
if (nativeProcess.argv[5] === "starlingmonkey") {
    guest.tick = JSON.parse(await instance.tick());
}
nativeProcess.stdout.write(
    JSON.stringify({
        guest,
        native: {
            pid: nativeProcess.pid,
            ids:
                nativeProcess.platform === "win32"
                    ? null
                    : {
                          uid: nativeProcess.getuid(),
                          euid: nativeProcess.geteuid(),
                          gid: nativeProcess.getgid(),
                          egid: nativeProcess.getegid(),
                          groups: nativeProcess.getgroups(),
                      },
            ppid: nativeProcess.ppid,
            arch: nativeProcess.arch,
            platform: nativeProcess.platform,
            version: nativeProcess.version,
            argv: nativeProcess.argv,
            cwd: nativeProcess.cwd(),
            flagsSize: nativeProcess.allowedNodeEnvironmentFlags.size,
        },
        environmentClean: nativeProcess.env.JCO_PROCESS_E2E === undefined,
    }),
);
