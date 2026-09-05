import net, { connect, createServer, Socket, Stream } from "node:net";

let server;
let handled;

export function surface() {
    const blockList = new net.BlockList();
    blockList.addSubnet("192.0.2.0", 24);
    return JSON.stringify({
        exports: Object.keys(net).sort(),
        aliases: connect === net.createConnection && Socket === Stream,
        ipv6: net.isIP("::ffff:192.0.2.1"),
        blocked: blockList.check("192.0.2.5"),
    });
}

export async function runClient(port) {
    const socket = connect(port, "127.0.0.1").setEncoding("utf8");
    const response = new Promise((resolve, reject) => {
        let body = "";
        socket.on("data", (chunk) => {
            body += chunk;
        });
        socket.once("end", () => resolve(body));
        socket.once("error", reject);
    });
    // preview2-shim 0.22.0 destroys both directions on shutdown("send"). Let the
    // peer close after its reply; directional shutdown is covered by provider tests.
    socket.write("client");
    return await response;
}

export function startServer() {
    handled = new Promise((resolve, reject) => {
        server = createServer((socket) => {
            server.close();
            socket.setEncoding("utf8");
            socket.once("error", reject);
            socket.once("data", (chunk) => socket.end(`guest:${chunk}`, resolve));
        });
        server.once("error", reject);
    });
    server.listen(0, "127.0.0.1");
    return server.address().port;
}

export async function serveOne() {
    await handled;
    await server[Symbol.asyncDispose]();
}
