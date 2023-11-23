import { createServer } from 'node:http';
import { parentPort } from 'node:worker_threads';

let PORT = 8125;

const server = createServer((req, res) => {
  res.writeHead(200, {
    'x-wasmtime-test-method': req.method,
    'x-wasmtime-test-uri': `http://localhost:${PORT}${req.url}`,
    'content-type': 'text/html'
  });
  res.end('');
});

let retry = false;
do {
  retry = await new Promise((resolve, reject) => {
    server.listen(PORT, resolve);
    server.on('error', e => {
      if (e.code === 'EADDRINUSE') {
        PORT++;
        resolve(true);
      } else {
        reject(e);
      }
    })
  });
} while (retry);

parentPort.postMessage(PORT);
