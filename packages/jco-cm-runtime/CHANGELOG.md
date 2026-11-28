# Changelog

## [0.0.2] - 2026-11-28

### 🚀 Features

- _(runtime)_ provide instance stop, idle, trap reporting and call tracking by @vados-cosmonic

- _(runtime)_ provide the generator and conditional host import helpers by @vados-cosmonic

- _(runtime)_ provide streams through selected runtime owners by @vados-cosmonic

- _(runtime)_ provide futures through selected runtime owners by @vados-cosmonic

- _(runtime)_ provide canonical lowering through traits by @vados-cosmonic

- _(runtime)_ provide canonical lifting through traits by @vados-cosmonic

- _(runtime)_ provide thread-aware host operations through traits by @vados-cosmonic

- _(runtime)_ provide external task and thread intrinsics by @vados-cosmonic

- _(runtime)_ provide error contexts through runtime traits by @vados-cosmonic

- _(runtime)_ provide waitable operations through runtime traits by @vados-cosmonic

- _(runtime)_ provide component state and per-thread scheduling by @vados-cosmonic

- _(runtime)_ provide core intrinsics with thread-aware contexts by @vados-cosmonic in #2377

- _(runtime)_ provide resource intrinsics through traits by @vados-cosmonic in #2376

- _(runtime)_ provide WebIDL intrinsics through traits by @vados-cosmonic

- _(runtime)_ provide string codecs and compact encodings through traits by @vados-cosmonic in #2374

- _(runtime)_ provide JS helpers with a trait-selected view cache by @vados-cosmonic in #2373

- _(runtime)_ provide external conversions through intrinsic traits by @vados-cosmonic

- _(runtime)_ [**breaking**] use named exports with explicit trap contexts by @vados-cosmonic

### 🐛 Bug Fixes

- _(runtime)_ keep the deprecated codepoints member of a string allocation by @vados-cosmonic

- _(runtime)_ count a host stream read for the instance reading it by @vados-cosmonic

- _(runtime)_ count a host future read for the instance reading it by @vados-cosmonic

- _(runtime)_ allocate per-instance host operation counts on first use by @vados-cosmonic

- _(runtime)_ trap a blocked sync call where it blocks by @vados-cosmonic

- _(runtime)_ check task.return's memory against the lift's memory by @vados-cosmonic

- _(runtime)_ trap on a synchronous cancel of an end in a waitable set by @vados-cosmonic

- _(runtime)_ keep the task's former entry-end method for released bindings by @vados-cosmonic

- _(runtime)_ release an async start's entry when lowering args traps by @vados-cosmonic

- _(runtime)_ release a sync start's entry when lowering args traps by @vados-cosmonic

- _(runtime)_ index a prepared call's implicit thread when it enters by @vados-cosmonic

- _(runtime)_ isolate a sync call from other instances' host waits by @vados-cosmonic

- _(runtime)_ end a sync caller's first slice when its callee blocks by @vados-cosmonic

- _(runtime)_ name exited tasks in a deadlock's detail by @vados-cosmonic

- _(runtime)_ stop counting a copy as host work once its end is lowered by @vados-cosmonic

- _(runtime)_ trap when a handle table is full by @vados-cosmonic

- _(runtime)_ trap with a RuntimeError on rep 0 in rep tables by @vados-cosmonic

- _(runtime)_ print handle indices in traps as unsigned by @vados-cosmonic

- _(runtime)_ observe a sync callee's result when it never enters by @vados-cosmonic

- _(runtime)_ count guest copies waiting on the host as host work by @vados-cosmonic

- _(runtime)_ index an export's implicit thread when its task enters by @vados-cosmonic

- _(runtime)_ mark the instance trapped on a callback-loop trap by @vados-cosmonic

- _(runtime)_ fail a blocked caller when its async callee traps by @vados-cosmonic

- _(runtime)_ return 0 from suspend and yield built-ins by @vados-cosmonic

- _(runtime)_ trap on callback codes above WAIT by @vados-cosmonic

- _(runtime)_ check lift options in task.cancel by @vados-cosmonic

- _(runtime)_ check task.return options before delivering results by @vados-cosmonic

- _(runtime)_ throw RuntimeError for async built-in traps by @vados-cosmonic

- _(runtime)_ trap on sync waits involving waitable sets by @vados-cosmonic

- _(runtime)_ keep entries cancelled at the entry slot from running by @vados-cosmonic

- _(runtime)_ give the entry slot to its waiters in arrival order by @vados-cosmonic

- _(runtime)_ admit tasks by the callee's lift options and type by @vados-cosmonic

- _(runtime)_ keep polling instances held back by a sync call by @vados-cosmonic

- _(runtime)_ schedule only the callee instance during sync calls by @vados-cosmonic

- _(runtime)_ trap at once when a suspending built-in traps by @vados-cosmonic

- _(runtime)_ respect the exclusive lock when promoting a thread by @vados-cosmonic

- _(runtime)_ exempt explicit threads from the exclusive lock by @vados-cosmonic

- _(runtime)_ leave a task unresolved when its last thread exits by @vados-cosmonic

- _(runtime)_ index resource lenders without wrapping shifts by @vados-cosmonic

- _(runtime)_ trap on handle indices past the end of a table by @vados-cosmonic

- _(runtime)_ reject busy future drops before removing handles by @vados-cosmonic

- _(runtime)_ ignore stale stream cancellations by @vados-cosmonic

- _(runtime)_ finish UTF-8 writes that encodeInto leaves short by @vados-cosmonic

- _(runtime)_ trap on stream read/write while a copy is in progress by @seunghyun-24

- _(runtime)_ use web APIs for encoding and scheduling by @vados-cosmonic

- _(runtime)_ track stream batch yields as pending host work by @vados-cosmonic

- _(runtime)_ resume suspended stacks one at a time by @vados-cosmonic

- _(runtime)_ handle synchronous lifts in fused start calls by @vados-cosmonic

- _(runtime)_ limit changelog entries to runtime commits by @vados-cosmonic in #2441

- _(runtime)_ complete stream reads with values already buffered from async sources by @zion-sati in #2437

- _(runtime)_ align thenable checks and boolean coercion across runtimes by @vados-cosmonic

- _(runtime)_ match inline messages, logs and guards outside the stream family by @vados-cosmonic

- _(runtime)_ close remaining gaps between inline and external intrinsics by @vados-cosmonic

- _(runtime)_ hold sync-lifted callees, abandon borrows on stop and trap repeated cancels by @vados-cosmonic

- _(runtime)_ stop external streams with their instance by @vados-cosmonic

- _(runtime)_ keep unused numeric widths out of scalar lowering bundles by @vados-cosmonic

- _(runtime)_ convert Unicode scalar values and track lifted error contexts by @vados-cosmonic

- _(runtime)_ preserve bulk copying when lifting numeric lists by @vados-cosmonic

- _(runtime)_ provide UTF-8 decoding in the external lift module by @vados-cosmonic

- _(runtime)_ settle idle waits when external tasks exit by @vados-cosmonic in #2381

- _(runtime)_ leave completed task futures unread by @vados-cosmonic

- _(runtime)_ report traps from the external async driver by @vados-cosmonic

- _(runtime)_ preserve task stop and synchronous host imports by @vados-cosmonic

- _(runtime)_ brace package consumer fixture conditionals by @vados-cosmonic in #2372

### 🚜 Refactor

- _(runtime)_ drop the code point count of an encoded string by @vados-cosmonic

- _(runtime)_ rename the entry slot wait and pass-on methods by @vados-cosmonic

- _(runtime)_ name a task's first run its initial invocation by @vados-cosmonic

- _(runtime)_ group stream, future, core and conversion modules into folders by @vados-cosmonic

- _(runtime)_ drop dead stream plumbing and keep queued host reads in order by @vados-cosmonic

- _(runtime)_ share one stream end and wake blocked host copies by event by @vados-cosmonic

- _(runtime)_ share stream operations between both end directions by @vados-cosmonic

- _(runtime)_ split async task intrinsics into modules by @vados-cosmonic

- _(runtime)_ keep the named API at v1 and organize tests by @vados-cosmonic

- _(runtime)_ use explicit Component Model API names by @vados-cosmonic

- _(runtime)_ clarify JavaScript API and add browser coverage by @vados-cosmonic

### 📚 Documentation

- _(runtime)_ document synchronous bindings and browser measurements by @vados-cosmonic

- _(runtime)_ name the wit-bindgen releases behind the held-back trap by @vados-cosmonic

- _(runtime)_ drop a stale example from the callee trap comment by @vados-cosmonic

- _(runtime)_ name the Canonical ABI built-in each intrinsic implements by @vados-cosmonic in #2388

- _(runtime)_ move intrinsic contracts into dedicated pages by @vados-cosmonic

- _(runtime)_ remove manual changelog entry by @vados-cosmonic

- _(runtime)_ document valid zero-valued resource representations by @vados-cosmonic in #2295

### ⚡ Performance

- _(runtime)_ share checked synchronous task and resource operations by @vados-cosmonic

- _(runtime)_ lift typed lists by slicing a view of memory by @vados-cosmonic

- _(runtime)_ read byte chunks of a returned host stream whole by @vados-cosmonic

- _(runtime)_ read a host stream a guest hands back from its source by @vados-cosmonic

- _(runtime)_ defer shared constructors and scalar registration by @vados-cosmonic

- _(runtime)_ reduce call overhead and label removable diagnostics by @vados-cosmonic

- _(runtime)_ create the context slots module bytes on demand by @vados-cosmonic

- _(runtime)_ keep context slots in WebAssembly globals by @vados-cosmonic

- _(runtime)_ [**breaking**] snapshot the debug environment at module load by @vados-cosmonic

- _(runtime)_ resume the tick loop on the next macrotask, not a clamped timer by @zion-sati

- _(runtime)_ copy numeric typed arrays together when lowering lists by @vados-cosmonic in #2386

- _(runtime)_ reduce task and conversion bundle overhead by @vados-cosmonic

### 🧪 Testing

- _(runtime)_ check that scheduler turns yield to the event loop by @vados-cosmonic in #2504

- _(runtime)_ cover bounds, alignment and ownership of typed lists by @vados-cosmonic

- _(runtime)_ cover synchronous future read traps by @vados-cosmonic

- _(runtime)_ cover async built-in traps and return values by @vados-cosmonic

- _(runtime)_ wait for the deadlock check instead of a fixed delay by @vados-cosmonic

- _(runtime)_ check that an exited task is rejected on deadlock by @vados-cosmonic

- _(runtime)_ cover a stream read after a raced cancellation by @vados-cosmonic

- _(runtime)_ cover stream copies with an undelivered event by @vados-cosmonic

- _(runtime)_ benchmark profiles and selectable revisions by @vados-cosmonic

- _(runtime)_ benchmark label stripping and runtime fast paths by @vados-cosmonic

- _(runtime)_ group stream tests into suites with shared helpers by @vados-cosmonic

- _(runtime)_ read API version from the new bindgen module by @vados-cosmonic in #2352

- _(runtime)_ modularize release conformance checks by @vados-cosmonic

### ⚙️ Miscellaneous Tasks

- _(runtime)_ restore the published package version by @vados-cosmonic in #2555

- _(runtime)_ update version to v0.1.0 by @vados-cosmonic

- _(runtime)_ set initial package version to 0.0.1 by @vados-cosmonic

## [unreleased]
