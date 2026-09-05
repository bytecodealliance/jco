import net from "node:net";

// WASI's synchronous pollables require the peer to run outside the guest process.
const server = net.createServer((socket) => {
    socket.setEncoding("utf8");
    socket.once("data", (chunk) => socket.end(`host:${chunk}`));
});
server.listen(0, "127.0.0.1", () => process.stdout.write(`${server.address().port}\n`));
