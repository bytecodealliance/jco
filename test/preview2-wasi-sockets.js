const { sockets } = await import("@bytecodealliance/preview2-shim");
const network = sockets.instanceNetwork.instanceNetwork();

// server
const serverAddressIpv6 = {
  tag: sockets.network.IpAddressFamily.ipv6,
  val: {
    address: [0, 0, 0, 0, 0, 0, 0, 0x1],
    port: 3000,
  },
};
const server = sockets.tcpCreateSocket.createTcpSocket(
  sockets.network.IpAddressFamily.ipv6
);
server.startBind(network, serverAddressIpv6);
server.finishBind();
server.startListen();
server.finishListen();
const {address, port} = server.localAddress().val;
console.log(`[wasi-sockets] Server listening on: ${address}:${port}`);

// client
const client = sockets.tcpCreateSocket.createTcpSocket(
  sockets.network.IpAddressFamily.ipv6
);

client.setKeepAlive(true);
client.setNoDelay(true);
client.startConnect(network, serverAddressIpv6);
client.finishConnect();

setTimeout(() => {
    client.shutdown("send");
    server.shutdown("receive");
    process.exit(0);
}, 2000);
