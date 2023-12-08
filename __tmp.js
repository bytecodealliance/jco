import { createSocket } from "dgram";
var socket = createSocket({
  type: "udp4",
});
const ret = socket.bind({
  address: "0.0.0.0",
  port: 0
}, () => {
});
console.log(socket.address());

socket.on("error", (err) => {
  console.error(err.errno);
});

// import { Socket, createConnection, _createServerHandle } from 'node:net';
// import { inspect } from 'node:util';

// {
//   console.log('START BIND');
//   // address, port=number, addressType=6 or 4, fd=null, flags=UV_* flags
//   var address = '0:0:0:0:0:ffff:7f00:1';
//   var port = 56345;
//   var addressType = 6;
//   var tcp_handle = _createServerHandle(address, port, addressType);
//   console.log('FINISH BIND');
// }

// {
//   createConnection(
//     {
//       // handle: new Socket({
//       //   handle: tcp_handle,
//       // }), // reuse
//       // localAddress: address,
//       // localPort: port,
//       port: port,
//       host: address,
//       // Stop the handle from reading and pause the stream
//       readable: false,
//       pauseOnCreate: true,
//     }
//   );
// }

// // {
// //   var server = createServer();
// //   server.on('error', (err) => {
// //     console.log(err);
// //     console.log('FINISH BIND (liten error)');
// //   });
// //   server.listen(handle, err => {
// //     console.log(err);
// //     console.log('FINISH BIND (listen completed)');
// //   });
// // }

// // {
// //   server.on('connection', () => {
// //     console.log('ACCEPT');
// //   });
// // }
