// Runs under a pseudo-terminal: the built module over the Node host, driving readline through
// real terminal streams. Prints a REPORT line the test parses.
import { createTty } from "../../../../../../dist/wasi/0.2.x/node/24.x.x/tty/core.js";
import host from "../../../../../../dist/wasi/0.2.x/node/24.x.x/tty-host-node.js";
import { createInterface } from "../../../../../../dist/wasi/0.2.x/node/24.x.x/readline.js";

const tty = createTty(host);
const report = { isatty: [0, 1, 2].map((fd) => tty.isatty(fd)), events: [] };

const output = new tty.WriteStream(1);
const input = new tty.ReadStream(0);
report.size = output.getWindowSize();
report.hasColors = output.hasColors();
report.depth = output.getColorDepth({ TERM: "xterm-256color" });
report.rawBefore = input.isRaw;
output.on("resize", () => report.events.push("resize"));
output._refreshSize();

const rl = createInterface({ input, output });
report.terminal = rl.terminal;
rl.question("Name? ", (answer) => {
  report.answer = answer;
  report.rawDuring = input.isRaw;
  rl.close();
  report.rawAfter = input.isRaw;
  output.cursorTo(0);
  output.clearLine(0);
  output.write(`REPORT ${JSON.stringify(report)}\n`);
  // Exit only once the runner acknowledges the report: a Linux pseudo-terminal can drop output
  // still buffered when its last slave descriptor closes.
  input.once("data", () => {
    output.destroy();
    input.destroy();
  });
  input.resume();
});
