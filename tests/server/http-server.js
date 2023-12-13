import { _forbiddenHeaders, HTTPServer } from '@bytecodealliance/preview2-shim/http';

_forbiddenHeaders.add('custom-forbidden-header');

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
    const component = await import(msg);
    server = new HTTPServer(component.incomingHandler);

    let port = 4999;
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
    console.error(`Error updating server handler to ${msg}`);
    console.error(e);
    process.exit(1);
  }
});
