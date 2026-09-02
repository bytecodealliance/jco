// Runs the transpiled node-inspector component out-of-process. The host adapter cannot import the
// component, so the embedder wires the guest-exported callbacks interface after instantiation with
// attachCallbacks, then drives run()/observed().
import { argv } from "node:process";

const [, , modulePath, hostPath] = argv;
const host = await import(hostPath);
const instance = await import(modulePath);

host.attachCallbacks(instance.inspectorCallbacks);
const results = await instance.run();
// Notifications are delivered between guest tasks; give the event loop a turn to drain them.
await new Promise((resolve) => setTimeout(resolve, 150));
const notified = instance.observed();

console.log(JSON.stringify({ results: JSON.parse(results), notified: JSON.parse(notified) }));
