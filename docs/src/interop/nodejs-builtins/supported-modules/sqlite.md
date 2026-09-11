# `node:sqlite`

| Imports | Implementation |
| --- | --- |
| `node:sqlite` | `@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/sqlite` |

Application code keeps ordinary `node:sqlite` imports:

```js
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');
try {
  db.exec('CREATE TABLE items(id INTEGER PRIMARY KEY, name TEXT)');
  db.prepare('INSERT INTO items(name) VALUES (?)').run('example');
  const rows = db.prepare('SELECT * FROM items').all();
} finally {
  db.close();
}
```

When bundling this module, Jco adds `jco:node/sqlite@0.1.0` to the selected WIT
world. WASI supplies no database API. This interface models databases, prepared
statements, lazy cursors, sessions, and SQL tag stores as resources; SQL values,
column metadata, and errors use typed records and variants. Providers can use
other SQLite implementations without depending on Node objects in the guest.

The default provider denies database creation, including `:memory:`, with
`ERR_JCO_SQLITE_ADAPTER_REQUIRED`. Importing the module and reading constants need
no database authority. Explicitly select the Node passthrough to execute SQL:

```console
jco transpile component.wasm \
  --map 'jco:node/sqlite@0.1.0=@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/sqlite/host/node'
```

Database, backup, attached-database, and extension paths refer to the **host
filesystem**, independently of the guest's WASI preopens. The passthrough grants
Node's SQLite authority; use a restricted custom provider when narrower access
is required. Extension loading still requires the database's `allowExtension`
option and Node's native checks.

The compatibility target is Node **24.20.0**, rather than the rolling Node API
page. Supported operations include database open/close and transactions,
prepared statement `all`/`get`/`run`/`iterate`, named and positional parameters,
blobs, signed 64-bit bigints, array rows, column metadata, SQL tag stores,
sessions and plain changeset application, serialization/deserialization, limits,
defensive mode, extension loading, and promise-based `backup`. Statements and
sessions retain their owning database; early iterator return releases the active
cursor. SQL execution and SQLite error fields come from the real host engine.

`DatabaseSync.function`, `aggregate`, and `setAuthorizer`, changeset callback
options, and backup's progress callback throw `ERR_JCO_SQLITE_CALLBACK_UNSUPPORTED`.
Synchronous callbacks would need to re-enter the guest while its SQL import is
active, which this component interface cannot support. These APIs are present
as explicit stubs; no callback is invoked. APIs added after the pinned release
are outside this compatibility target.

Mapping a custom SQLite provider enables JSPI for the `backup` import and makes
component exports promising; await calls into the transpiled component. The
synchronous database tests run on both StarlingMonkey and QuickJS. Backup is
also tested end to end on StarlingMonkey; QuickJS currently cannot lower a
Promise returned by an exported guest function. Use StarlingMonkey for that
asynchronous guest flow.

The implementation is available directly at
`@bytecodealliance/jco-std/wasi/0.2.x/node/24.x.x/sqlite`, with an injectable factory
at `sqlite/core`, but Jco's ordinary `node:` import handling is the recommended
application entry point. It can be mixed with other supported Node builtins.
