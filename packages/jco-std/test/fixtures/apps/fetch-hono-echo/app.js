import { Hono } from "hono";
import { fire } from "@bytecodealliance/jco-std/wasi/0.2.3/http/adapters/hono/server";

const app = new Hono();
app.post("/", async (c) => {
  return c.text(await c.req.text());
});

fire(app, { useFetchEvent: true });
