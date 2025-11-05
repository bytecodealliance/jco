import { Hono } from "hono";

// NOTE: we can use a newer version of `wasi:http` here because manual use of
// of `wasi:http` is not governed by support in StarlingMonkey -- when using the
// interfaces manually we can use whatever version of `wasi:http` we want.
//
// It's only when using the fetch-event integration that we're limited to the
// version built in to StarlingMonkey
import { fire } from '@bytecodealliance/jco-std/wasi/0.2.6/http/adapters/hono';

const app = new Hono();
app.get("/", (c) => c.text("Hello World!"));

fire(app);

// Although we've called `fire()` with wasi HTTP configured for use above,
// we still need to actually export the `wasi:http/incoming-handler` interface object,
// as componentize-js will be looking for the ES module export.
export { incomingHandler } from '@bytecodealliance/jco-std/wasi/0.2.6/http/adapters/hono';
