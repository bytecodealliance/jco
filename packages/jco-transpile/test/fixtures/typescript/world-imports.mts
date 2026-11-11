import log from 'log';
import lookupEntry from 'lookup-entry';
import apply from 'apply';
import later from 'later';
import type { Entry, Operation } from 'test:declaration-names/world-imports-world';

log('message');

// The `err` case of a returned `result` is thrown, so the call returns the `ok` payload.
const entry: Entry = lookupEntry('key');
const operation: Operation = { tag: 'cancel' };
const applied = apply(operation, [
    { tag: 'ok', val: entry },
    { tag: 'err', val: 'message' },
]);
if (applied.tag === 'some') {
    const nested: Entry | undefined = applied.val;
    void nested;
}

const pending: Promise<Entry> = later('key');
void pending;

// @ts-expect-error the argument is a string
log(1);
