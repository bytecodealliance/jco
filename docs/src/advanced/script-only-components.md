# Script-only components

`jco componentize` normally bakes one script into one JavaScript engine, producing a component that is
ready to run. `--script-only` splits that in two:

- an **engine component**, `engine.wasm`: the selected JavaScript engine (StarlingMonkey or QuickJS)
  componentized against the *union* of the given WIT worlds, with an extra export,
  `jco:script-engine/script-loader`, through which a host feeds it scripts at runtime;
- one **script-only component** per source: a tiny component that exports `jco:script/script` and
  does nothing but hand back the script's source and some metadata. It is packaging, not execution.

A host instantiates the engine once, instantiates a script-only component whenever it needs a script,
reads the script out of it and loads it into the engine. The engine's world exports then forward to
that script. Loading another script replaces the previous one, so a single engine instance runs scripts
one after the other.

> [!WARNING]
> Scripts loaded into the same engine instance share one JavaScript realm. Anything a script leaves on
> `globalThis`, or in the imports it holds on to, is visible to the next script. A script engine is a
> way to reuse an engine build across scripts, **not** a sandbox between tenants. Instantiate a fresh
> engine per trust boundary.

## Building

Pass `--script-only`, one or more `--wit` paths, the scripts to package, and an output *directory*:

```console
jco componentize --script-only \
  --wit ./wit-greeter --wit ./wit-calc \
  greet.js calc.ts \
  -o ./dist
```

This writes `dist/engine.wasm`, `dist/engine.wit` (the merged world the engine was built against),
`dist/greet.wasm` and `dist/calc.wasm`.

- `--wit` is repeatable. Each path is a WIT file or directory; the engine world is the union of their
  worlds plus `jco:script-engine/script-loader`. Shared dependencies such as `wasi:cli` are merged when
  the packages agree. Two worlds exporting different interfaces that would share a JavaScript export
  name (for example `a:x/types` and `b:y/types`) are rejected, since the engine presents one namespace
  to its scripts.
- `--world-name` is repeatable too. Give none to use each package's only world, or one name per `--wit`
  path in the same order.
- Scripts may be omitted to build only the engine. The engine does not need to know which scripts will
  run on it, only which imports and exports they may use.
- `--backend starlingmonkey` (default) or `--backend quickjs` selects the engine. `--engine <path>` uses
  a specific StarlingMonkey build or QuickJS runtime module, so an existing engine release can be
  wrapped without rebuilding it.
- Scripts are always bundled (TypeScript included) into a single ES module whose imports name WIT
  interfaces. A script that imports an interface the engine world does not import fails the build;
  a script that exports something the engine world does not export produces a warning.

Other `jco componentize` options apply to the engine build. Node.js built-in compatibility
(`--with-nodejs-*`) is not available in this mode, because it rewrites the WIT world per script.

## Running

Transpile the engine and the script components like any other component, then load scripts through
the engine's `scriptLoader` export:

```console
jco transpile dist/engine.wasm -o dist/host/engine --map 'local:greeter/logger=./logger.js'
jco transpile dist/greet.wasm -o dist/host/greet
jco transpile dist/calc.wasm -o dist/host/calc
```

```js
import { scriptLoader, greeter, calc, run } from "./dist/host/engine/engine.js";
import { script as greet } from "./dist/host/greet/greet.js";
import { script as calcScript } from "./dist/host/calc/calc.js";

scriptLoader.load(greet.name(), greet.source());
run(); // "greet"
greeter.greet("jco"); // "Hello, jco!"
new greeter.Counter(41).get(); // 41

scriptLoader.load(calcScript.name(), calcScript.source());
run(); // "calc"
calc.add(2, 3); // 5

scriptLoader.loaded(); // "calc.js"
scriptLoader.unload();
```

The engine's imports (here `local:greeter/logger`) are supplied by the host of the engine, exactly as
for a regular component; the script components import nothing. Any component runtime can do the same:
instantiate the engine, call `script.source()` on a script component, and pass the result to
`script-loader.load`.

## The interfaces

Every engine exports `jco:script-engine/script-loader@0.1.0`:

```wit
interface script-loader {
    /// Evaluate `source` and make its exports the implementation behind the engine's
    /// world exports, replacing any previously loaded script.
    load: func(name: string, source: string) -> result<_, string>;

    /// Drop the loaded script. World exports fail until another script is loaded.
    unload: func();

    /// Name of the loaded script, if any.
    loaded: func() -> option<string>;
}
```

`load` takes an ES module. Neither engine can import a module from a string at runtime, so the loader
rewrites the module's top-level `import` declarations and its export list before evaluating it. It
relies on the shape Rolldown produces, which `jco componentize --script-only` always uses: imports
hoisted to the top, one `export { ... }` list at the end, no top-level `await`. `load` returns an error
when the script fails to parse or evaluate, or imports something the engine world lacks; the previously
loaded script stays loaded. Calling a world export that the loaded script
does not implement throws inside the engine, which traps unless the export returns a `result`.

Every script-only component exports `jco:script/script@0.1.0`:

```wit
interface script {
    /// Name the script was packaged under, usually its entry file name.
    name: func() -> string;

    /// The script as a bundled ES module whose imports name WIT imports of the engine world.
    source: func() -> string;

    /// Fully-qualified engine world the script was bundled against.
    engine-world: func() -> string;

    /// JavaScript export names found in the script.
    exports: func() -> list<string>;
}
```

`exports` lets a host check that a script implements what it is about to call before loading it.

## Writing scripts

Scripts are ordinary component sources: `import` WIT imports by their specifier and `export` the
world's exports under the usual JavaScript names, exactly as for `jco componentize` without
`--script-only`. A script only has to implement the exports the host will call while it is loaded.

Exported resources work as well: the engine's class for a resource stands in for the script's class,
and instances created by either side pass through transparently. Two limits apply:

- With the QuickJS backend, functions imported directly on a world (`import log: func(...)`) are not
  supported in script-only mode; place them in an interface instead.
- Resources are matched by their exported class. A script that exports a different class for the same
  resource than the one the host already holds instances of will not recognise those instances.
