import { type BuiltinContext, type BuiltinAdapter, builtin, stdModule } from "./shared.js";
import { CLUSTER_WIT_REQUIREMENT } from "../node-wit.js";

const CLUSTER_SPECIFIER = "node:cluster";

/**
 * Source of the `node:cluster` adapter.
 *
 * Like `node:child_process`, the jco-std module imports the host interface itself, so the adapter
 * only has to re-export Node's module shape.
 */
function clusterAdapter(clusterModule: string): string {
    return `
import cluster from ${JSON.stringify(clusterModule)};
export default cluster;
export {
    SCHED_NONE,
    SCHED_RR,
    Worker,
    disconnect,
    fork,
    setupMaster,
    setupPrimary,
} from ${JSON.stringify(clusterModule)};
`;
}

export function createClusterBuiltin({ options }: BuiltinContext): BuiltinAdapter {
    return builtin(
        CLUSTER_SPECIFIER,
        () => clusterAdapter(stdModule(options.clusterModule, "cluster")),
        () => options.onWitRequirement?.(CLUSTER_WIT_REQUIREMENT),
    );
}
