// Inherited through execArgv by the guest server process. Delaying the actual
// write makes an unflushed port announcement deadlock reliably when the guest
// starts polling for a connection before the parent knows its port.
const write = process.stdout.write.bind(process.stdout);

/** Defer pipe writes to exercise readiness announcements under backpressure. */
process.stdout.write = (...args) => {
    setTimeout(() => write(...args), 50);
    return false;
};
