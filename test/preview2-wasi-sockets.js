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
server.startBind(server, network, serverAddress);
server.finishBind(server);
server.startListen(server);
server.finishListen(server);
const {address, port} = server.localAddress(server).val;
console.log(`[wasi-sockets] Server listening on: ${address}:${port}`);

// client

const client = sockets.tcpCreateSocket.createTcpSocket(
  sockets.network.IpAddressFamily.ipv4
);

client.startConnect(client, network, serverAddress);
client.finishConnect(client);
setTimeout(() => {
  client.dropTcpSocket(client);
  server.dropTcpSocket(server);
}, 2000);
