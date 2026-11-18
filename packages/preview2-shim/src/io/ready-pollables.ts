/**
 * Pollables that are ready from the moment they are created.
 *
 * The streams of a file served on the main thread complete every read and
 * write within the call, so their pollables need no state in the I/O worker
 * and no round trip to it.
 *
 * Generated bindings identify a pollable by its `rep`, which has to fit in a
 * resource table entry beside the entry's flag bit: 1 to 2^30 - 1. That range
 * is split in two fixed parts, so that one comparison tells the kinds apart:
 *
 * - 1 to `FIRST_READY_REP - 1` are poll ids of the I/O worker, which counts
 *   up from 1 and refuses to go further (`checkWorkerPollId`);
 * - `FIRST_READY_REP` to `LAST_READY_REP` are ready pollables. A dropped rep
 *   is handed out again, so the part bounds how many are alive at once, not
 *   how many are ever created.
 */

/** Largest rep a resource table entry can hold beside its own flag bit. */
export const LAST_READY_REP = (1 << 30) - 1;

/** Ready pollables that can be alive at once. */
export const READY_REP_COUNT = 1 << 20;

/** Smallest rep of a ready pollable, and the first value no worker poll id may take. */
export const FIRST_READY_REP = LAST_READY_REP + 1 - READY_REP_COUNT;

/** The resource a ready pollable was subscribed from. */
export interface ReadyPollableOwner {
    /** Child pollables that have not been dropped yet. */
    pollables: number;
}

// Reps count down from the top until dropped ones can be used again.
let lowestRep = LAST_READY_REP + 1;
const freeReps: number[] = [];
const owners = new Map<number, ReadyPollableOwner>();

/**
 * Allocate the rep of a new ready pollable.
 *
 * @param owner - the resource being subscribed to, which counts the pollable as a child
 * @returns the rep to create the pollable with
 */
export function createReadyPollableRep(owner: ReadyPollableOwner): number {
    let rep = freeReps.pop();
    if (rep === undefined) {
        if (lowestRep === FIRST_READY_REP) {
            throw new Error(
                `wasi-io trap: more than ${READY_REP_COUNT} pollables of main-thread file streams are alive`,
            );
        }
        rep = --lowestRep;
    }
    owner.pollables++;
    owners.set(rep, owner);
    return rep;
}

/**
 * Whether a rep belongs to a ready pollable rather than to the I/O worker.
 *
 * @param rep - the rep of any pollable
 * @returns true for a rep allocated by `createReadyPollableRep`
 */
export function isReadyPollableRep(rep: number): boolean {
    return rep >= FIRST_READY_REP;
}

/**
 * Drop a ready pollable, releasing its owner to be dropped in turn.
 *
 * @param rep - a rep allocated by `createReadyPollableRep`
 */
export function disposeReadyPollableRep(rep: number): void {
    const owner = owners.get(rep);
    if (!owner) {
        throw new Error(`wasi-io trap: Disposed a poll ${rep} that does not exist`);
    }
    owners.delete(rep);
    owner.pollables--;
    freeReps.push(rep);
}

/**
 * Keep the poll ids of the I/O worker out of the reps of ready pollables.
 *
 * @param pollId - the id the worker is about to hand out
 * @returns the id
 */
export function checkWorkerPollId(pollId: number): number {
    if (pollId >= FIRST_READY_REP) {
        throw new Error(`wasi-io trap: the I/O worker has no poll id left after ${pollId - 1}`);
    }
    return pollId;
}

/**
 * Trap when a resource is dropped before the pollables subscribed from it,
 * as the I/O worker does for its own streams.
 *
 * @param owner - the resource being dropped
 * @param debugName - how to name the resource in the trap message
 */
export function verifyReadyPollablesDropped(owner: ReadyPollableOwner, debugName: string): void {
    if (owner.pollables > 0) {
        throw new Error(
            `wasi-io trap: Cannot drop ${debugName} as it has a child poll resource which has not yet been dropped`,
        );
    }
}
