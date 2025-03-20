addEventListener("fetch", (event) =>
  event.respondWith(
    (async () => {
      return new Response("Hello World");
    })(),
  ),
);
