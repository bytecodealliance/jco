# `node:readline`

| Imports | Implementation |
| --- | --- |
| `node:readline`, `node:readline/promises` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/readline` and `/readline/promises` |

`node:readline` and `node:readline/promises` support callback and promise questions,
line events, async iteration, streaming UTF-8/CRLF decoding, prompts, terminal
editing and history, keypress events, and cursor actions. Both share a port of
[Node v24.20.0's readline implementation](https://github.com/nodejs/node/tree/v24.20.0/lib/internal/readline).

Applications keep ordinary Node imports and supply readable and writable streams:

```js
import * as readline from 'node:readline/promises';

export async function ask(input, output) {
    const rl = readline.createInterface({ input, output });
    try {
        const answer = await rl.question('What do you think of Node.js? ');
        output.write(`Thank you for your valuable feedback: ${answer}\n`);
    } finally {
        rl.close();
    }
}
```

Bundle application code with `jco componentize app.js --bundle --wit wit -o app.wasm`.
Readline itself requires no WIT imports. The streams determine where input and
output go. `node:process` resolves inside a component, but its `stdin`, `stdout`
and `stderr` are host stream objects that cannot cross the component boundary and
throw `ERR_JCO_UNSUPPORTED_NODE_API` (see [process restrictions](./process.md#process-restrictions)).
The Node documentation's literal `import { stdin, stdout } from 'node:process'`
example therefore runs unchanged on Node but not in a component; supply streams
from the component's own I/O instead. The test fixture runs that literal example
against the shim on Node, and runs the same question/answer flow with supplied
streams in QuickJS and StarlingMonkey.

## Terminal and scheduling boundaries

Terminal streams may supply `setRawMode`, `columns`, and resize events. Terminal
mode emits ANSI sequences without inspecting a host `TERM` variable; an application
that wants Node's `TERM=dumb` behaviour can read `process.env.TERM` through
`node:process` and pass `terminal: false` itself. Ctrl+Z can be handled with a
`SIGTSTP` listener; otherwise it throws `ERR_JCO_UNSUPPORTED_NODE_API`. Node
suspends itself with `process.kill(process.pid, 'SIGTSTP')` and resumes from a
`SIGCONT` listener; the `node:process` facade refuses signal listeners, and
readline deliberately does not import it, so using readline never adds the
process capability to a component.

Cursor widths use Node's non-ICU tables, with normalization where the engine
provides it; some Unicode widths differ from ICU-enabled Node. Deferred callbacks
and automatic cursor commits use microtasks rather than Node's separate next-tick
queue. Completion-error text uses portable string formatting.

Timed Escape-key disambiguation requires engine timers; engines without timers
throw an explicit `ERR_JCO_UNSUPPORTED_NODE_API` for that operation. Cancellation
accepts supplied AbortSignals; readline does not install missing Abort globals.
QuickJS async entry functions must be declared `async func` in WIT.
