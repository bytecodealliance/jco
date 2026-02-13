import { Hono } from "hono";
import { fire } from "@bytecodealliance/jco-std/wasi/0.2.6/http/adapters/hono/server";

const app = new Hono();
app.get("/", async (c) => {
  const resp = await fetch("https://example.com");
  await new Promise((r) => setTimeout(r, 500));
  return c.text(`status: ${resp.status}`);
});

fire(app);

export { incomingHandler } from "@bytecodealliance/jco-std/wasi/0.2.6/http/adapters/hono/server";
