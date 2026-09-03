// Worker entry for cluster/fork.ts.
//
// cluster.fork() re-executes the primary's entry, which inside vitest would be the test runner.
// fork.ts therefore points the primary at this script with cluster.setupPrimary({ exec }), so the
// real node:cluster worker lifecycle -- fork, online, IPC in both directions, and a signalled exit
// -- runs against the jco-std host adapter without forking the runner.
//
// Plain JavaScript on purpose: a cluster worker is a fresh Node process with no test harness.

process.send({ from: "worker", pid: process.pid, role: process.env.JCO_TEST_ROLE ?? "" });

process.on("message", (message) => {
  process.send({ echo: message });
});

// Stay alive until the primary kills us; the IPC channel alone would let the loop drain.
setInterval(() => {}, 60_000);
