// Imports node:cluster from a world that does not import the cluster host interface.
// Componentizing this must fail with a diagnostic naming the missing interface.
import cluster from "node:cluster";

export function run() {
    return cluster.isPrimary;
}
