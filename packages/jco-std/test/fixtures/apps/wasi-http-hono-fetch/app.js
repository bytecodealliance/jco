import { Hono } from "hono";
import { fire } from "@bytecodealliance/jco-std/wasi/0.2.6/http/adapters/hono/server";

const app = new Hono();
app.get("/", async (c) => {
  const resp = await fetch(c.req.query("upstream"));
  return c.text(`status: ${resp.status}`);
});

fire(app);

export { incomingHandler } from "@bytecodealliance/jco-std/wasi/0.2.6/http/adapters/hono/server";
