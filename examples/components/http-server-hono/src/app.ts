import { Hono } from "hono";
import { showRoutes } from "hono/dev";
import { logger } from "hono/logger";

export const app = new Hono();

app.use(logger());

app.get("/", async (c) => {
  return c.text("Hello world!");
});

// showRoutes() logs all the routes available,
// but this line only runs once during component build, due
// to component optimization intricacies (wizer)
showRoutes(app, {
  verbose: true,
});
