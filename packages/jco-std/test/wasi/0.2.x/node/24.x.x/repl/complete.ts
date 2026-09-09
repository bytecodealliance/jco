// Tab completion through `replServer.complete()` and the completer readline calls.
// Adapted from Node v24.20.0 test/parallel/test-repl-tab-complete.js.
import { expect, test } from "vitest";
import { hostIsTargetNode } from "../helpers/assert.js";
import { open, portable, native, type ReplApi, type SessionRepl } from "../helpers/repl.js";

function completions(repl: SessionRepl, line: string): Promise<[string[], string]> {
  return new Promise((resolve, reject) => {
    repl.complete(line, (error, result) => (error ? reject(error) : resolve(result!)));
  });
}

async function withRepl<T>(api: ReplApi, run: (repl: SessionRepl) => Promise<T>): Promise<T> {
  const session = open(api);
  try {
    return await run(session.repl);
  } finally {
    session.repl.close();
  }
}

const differential = test.skipIf(!hostIsTargetNode);

differential.concurrent("member, keyword and command completion match Node", async () => {
  const lines = [
    "Math.",
    "Math.ma",
    "JSON.stri",
    "'str'.toUpper",
    "[].len",
    "({ completeProp: 1 }).comp",
    ".he",
    ".",
    "require('f",
    "import('node:f",
    "let completeLocal = 1; completeL",
    "typeof Math.P",
    "new Ma",
    "delete Math.P",
  ];
  for (const line of lines) {
    const actual = await withRepl(portable, (repl) => completions(repl, line));
    const expected = await withRepl(native, (repl) => completions(repl, line));
    expect(actual, line).toEqual(expected);
  }
});

test.concurrent("global completion lists the context's own names and adds keywords when filtering", async () => {
  await withRepl(portable, async (repl) => {
    const [all, on] = await completions(repl, "");
    expect(on).toBe("");
    expect(all).toContain("Math");
    expect(all).toContain("globalThis");
    expect(all).not.toContain("await");
    const [filtered, filteredOn] = await completions(repl, "aw");
    expect(filteredOn).toBe("aw");
    expect(filtered).toContain("await");
  });
});

test.concurrent("completion refuses to evaluate getters and side effects", async () => {
  await withRepl(portable, async (repl) => {
    Object.defineProperty(globalThis, "completeGetter", {
      configurable: true,
      get() {
        throw new Error("must not run");
      },
    });
    try {
      const [none] = await completions(repl, "completeGetter.");
      expect(none).toEqual([]);
      const [call] = await completions(repl, "completeCall().");
      expect(call).toEqual([]);
    } finally {
      Reflect.deleteProperty(globalThis, "completeGetter");
    }
  });
});

test.concurrent("optional chaining and array indices are handled", async () => {
  await withRepl(portable, async (repl) => {
    const [chained, chainedOn] = await completions(repl, "Math?.ab");
    expect(chainedOn).toBe("Math?.ab");
    expect(chained).toEqual(["Math?.abs"]);
    (globalThis as { completeArray?: unknown }).completeArray = ["x"];
    try {
      const [members] = await completions(repl, "completeArray.");
      expect(members).not.toContain("completeArray.0");
      expect(members).toContain("completeArray.length");
    } finally {
      Reflect.deleteProperty(globalThis, "completeArray");
    }
  });
});

test.concurrent("the readline completer expands a common prefix in terminal mode", async () => {
  const session = open(portable, { terminal: true });
  session.repl.write("Math.PI.toFi");
  session.repl.write(null, { name: "tab" });
  await session.settle();
  expect(session.repl.line).toBe("Math.PI.toFixed");
  session.repl.close();
});

test.concurrent("editor mode completion keeps only the common prefix", async () => {
  await withRepl(portable, async (repl) => {
    type EditorCallback = (err: Error | null, result?: [string[], string]) => void;
    const editor = repl as SessionRepl & {
      completeOnEditorMode(cb: EditorCallback): EditorCallback;
    };
    const editorCompletions = await new Promise<[string[], string]>((resolve) => {
      repl.complete(
        "Math.ma",
        editor.completeOnEditorMode((_err, result) => resolve(result!)),
      );
    });
    expect(editorCompletions).toEqual([["Math.max"], "Math.ma"]);
  });
});
