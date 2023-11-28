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
const server = sockets.udpCreateSocket.createUdpSocket(
  sockets.network.IpAddressFamily.ipv6
);
server.startBind(network, serverAddressIpv6);
server.finishBind();
const { address, port } = server.localAddress().val;
console.log(`[wasi-sockets-udp] Server listening on: ${address}:${port}`);

// client
const client = sockets.udpCreateSocket.createUdpSocket(
  sockets.network.IpAddressFamily.ipv6
);

client.startConnect(network, serverAddressIpv6);
client.finishConnect();

setTimeout(() => {
  client.send([
    {
      data: [Buffer.from('hello world')],
      remoteAddress: serverAddressIpv6,
    }
  ]);

  const data = server.receive();
  console.log(`[wasi-sockets-udp] Server received`);
  console.log({
    data
  });
}, 2000);

setTimeout(() => {
  server[Symbol.dispose]();
  client[Symbol.dispose]();
}, 5000);