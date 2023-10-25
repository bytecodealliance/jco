const { sockets } = await import("@bytecodealliance/preview2-shim");
const network = sockets.instanceNetwork.instanceNetwork();

// server
const serverAddress = {
  tag: sockets.network.IpAddressFamily.ipv4,
  val: {
    address: [127, 0, 0, 1],
    port: 3000,
  },
};
const server = sockets.tcpCreateSocket.createTcpSocket(
  sockets.network.IpAddressFamily.ipv4
);
server.startBind(network, serverAddress);
server.finishBind();
server.startListen();
server.finishListen();
const {address, port} = server.localAddress().val;
console.log(`[wasi-sockets] Server listening on: ${address}:${port}`);

// client

const client = sockets.tcpCreateSocket.createTcpSocket(
  sockets.network.IpAddressFamily.ipv4
);

client.startConnect(network, serverAddress);
client.finishConnect();

setTimeout(() => {
    client.shutdown("send");
    server.shutdown("receive");
    process.exit(0);
}, 2000);
