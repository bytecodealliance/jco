import { type BuiltinContext, type BuiltinAdapter, builtin, stdModule } from "./shared.js";
import { OS_WIT_REQUIREMENT } from "../node-wit.js";

const OS_SPECIFIER = "node:os";

/** Source of the host-backed `node:os` ESM facade. */
function osAdapter(osModule: string): string {
    return `
import os from ${JSON.stringify(osModule)};
export default os;
export {
    EOL,
    arch,
    availableParallelism,
    constants,
    cpus,
    devNull,
    endianness,
    freemem,
    getPriority,
    homedir,
    hostname,
    loadavg,
    machine,
    networkInterfaces,
    platform,
    release,
    setPriority,
    tmpdir,
    totalmem,
    type,
    uptime,
    userInfo,
    version,
} from ${JSON.stringify(osModule)};
`;
}

export function createOsBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return builtin(
        OS_SPECIFIER,
        () => osAdapter(stdModule(options.osModule, "os")),
        () => options.onWitRequirement?.(OS_WIT_REQUIREMENT),
    );
}
