import { type BuiltinContext, type BuiltinAdapter, builtin, stdModule } from "./shared.js";
import { CHILD_PROCESS_WIT_REQUIREMENT } from "../node-wit.js";

const CHILD_PROCESS_SPECIFIER = "node:child_process";

function childProcessAdapter(childProcessModule: string): string {
    return `
import childProcess from ${JSON.stringify(childProcessModule)};
export default childProcess;
export {
    ChildProcess,
    exec,
    execFile,
    execFileSync,
    execSync,
    fork,
    spawn,
    spawnSync,
} from ${JSON.stringify(childProcessModule)};
`;
}

export function createChildProcessBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return builtin(
        CHILD_PROCESS_SPECIFIER,
        () => childProcessAdapter(stdModule(options.childProcessModule, "child-process")),
        () => options.onWitRequirement?.(CHILD_PROCESS_WIT_REQUIREMENT),
    );
}
