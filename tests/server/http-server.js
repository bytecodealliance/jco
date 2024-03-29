import { _forbiddenHeaders, HTTPServer } from '@bytecodealliance/preview2-shim/http';
import { _setPreopens } from "@bytecodealliance/preview2-shim/filesystem";
import process from "node:process";

_forbiddenHeaders.add('custom-forbidden-header');

if (process.env.FS === "0")
  _setPreopens({});

let server;
process.on('message', async msg => {
  // null message = exit
  if (!msg) {
    if (server)
      server.stop();
    process.exit();
    return;
  }
  try {
    console.error('Importing handler', msg);
    const component = await import(msg);
    server = new HTTPServer(component.incomingHandler);

    let port = Math.round(Math.random() * 5000 + 5000);
    let retry = false;
    do {
      try {
        server.listen(port);
      } catch (e) {
        console.error(e);
        port++;
        retry = true;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } while (retry);
    
    console.error(`Server listening on ${port}`);
    process.send(`localhost:${port}`);
    
    process.on('exit', () => {
      server.stop();
    });

  } catch (e) {
    if (process._rawDebug)
      process._rawDebug(e);
    console.error(`Error updating server handler to ${msg}`);
    console.error(e);
    process.exit(1);
  }
});
