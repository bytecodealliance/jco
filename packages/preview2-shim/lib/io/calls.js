let call_id = 0;

// Call is a 32 bit integer, leading 8 bits are call number, trailing 24 bits allow custom call types
export const CALL_MASK = 0xff000000;
export const CALL_TYPE_MASK = 0x00ffffff;
export const CALL_SHIFT = 24;

// Type indiciator for generic Stream, Future, and Poll calls
let cnt = 0;
export const STDIN = ++cnt;
export const STDOUT = ++cnt;
export const STDERR = ++cnt;
export const FILE = ++cnt;
export const HTTP = ++cnt;
export const SOCKET_TCP = ++cnt;
export const SOCKET_UDP = ++cnt;
export const CLOCKS = ++cnt;

// Io Input Stream
export const INPUT_STREAM_CREATE = ++call_id << CALL_SHIFT;
export const INPUT_STREAM_READ = ++call_id << CALL_SHIFT;
export const INPUT_STREAM_BLOCKING_READ = ++call_id << CALL_SHIFT;
export const INPUT_STREAM_SKIP = ++call_id << CALL_SHIFT;
export const INPUT_STREAM_BLOCKING_SKIP = ++call_id << CALL_SHIFT;
export const INPUT_STREAM_SUBSCRIBE = ++call_id << CALL_SHIFT;
export const INPUT_STREAM_DISPOSE = ++call_id << CALL_SHIFT;

// Io Output Stream
export const OUTPUT_STREAM_CREATE = ++call_id << CALL_SHIFT;
export const OUTPUT_STREAM_CHECK_WRITE = ++call_id << CALL_SHIFT;
export const OUTPUT_STREAM_WRITE = ++call_id << CALL_SHIFT;
export const OUTPUT_STREAM_BLOCKING_WRITE_AND_FLUSH = ++call_id << CALL_SHIFT;
export const OUTPUT_STREAM_FLUSH = ++call_id << CALL_SHIFT;
export const OUTPUT_STREAM_BLOCKING_FLUSH = ++call_id << CALL_SHIFT;
export const OUTPUT_STREAM_WRITE_ZEROES = ++call_id << CALL_SHIFT;
export const OUTPUT_STREAM_BLOCKING_WRITE_ZEROES_AND_FLUSH =
  ++call_id << CALL_SHIFT;
export const OUTPUT_STREAM_SPLICE = ++call_id << CALL_SHIFT;
export const OUTPUT_STREAM_BLOCKING_SPLICE = ++call_id << CALL_SHIFT;
export const OUTPUT_STREAM_SUBSCRIBE = ++call_id << CALL_SHIFT;
export const OUTPUT_STREAM_DISPOSE = ++call_id << CALL_SHIFT;

export const OUTPUT_STREAM_GET_TOTAL_BYTES = ++call_id << CALL_SHIFT;

// Io Poll
export const POLL_POLLABLE_READY = ++call_id << CALL_SHIFT;
export const POLL_POLLABLE_BLOCK = ++call_id << CALL_SHIFT;
export const POLL_POLL_LIST = ++call_id << CALL_SHIFT;

// Futures
export const FUTURE_GET_VALUE_AND_DISPOSE = ++call_id << CALL_SHIFT;
export const FUTURE_DISPOSE = ++call_id << CALL_SHIFT;

// Http
export const HTTP_CREATE_REQUEST = ++call_id << 24;
export const HTTP_OUTPUT_STREAM_FINISH = ++call_id << CALL_SHIFT;
// Http server
export const HTTP_SERVER_START = ++call_id << CALL_SHIFT;
export const HTTP_SERVER_STOP = ++call_id << CALL_SHIFT;
export const HTTP_SERVER_INCOMING_HANDLER = ++call_id << CALL_SHIFT;
export const HTTP_SERVER_SET_OUTGOING_RESPONSE = ++call_id << CALL_SHIFT;
export const HTTP_SERVER_CLEAR_OUTGOING_RESPONSE = ++call_id << CALL_SHIFT;

// Clocks
export const CLOCKS_NOW = ++call_id << CALL_SHIFT;
export const CLOCKS_DURATION_SUBSCRIBE = ++call_id << CALL_SHIFT;
export const CLOCKS_INSTANT_SUBSCRIBE = ++call_id << CALL_SHIFT;

// Sockets
// Tcp
export const SOCKET_TCP_CREATE_HANDLE = ++call_id << CALL_SHIFT;
export const SOCKET_TCP_BIND = ++call_id << CALL_SHIFT;
export const SOCKET_TCP_CONNECT = ++call_id << CALL_SHIFT;
export const SOCKET_TCP_SUBSCRIBE = ++call_id << CALL_SHIFT;
export const SOCKET_TCP_LISTEN = ++call_id << CALL_SHIFT;
export const SOCKET_TCP_ACCEPT = ++call_id << CALL_SHIFT;
export const SOCKET_TCP_GET_LOCAL_ADDRESS = ++call_id << CALL_SHIFT;
export const SOCKET_TCP_GET_REMOTE_ADDRESS = ++call_id << CALL_SHIFT;
export const SOCKET_TCP_SHUTDOWN = ++call_id << CALL_SHIFT;
export const SOCKET_TCP_SET_KEEP_ALIVE = ++call_id << CALL_SHIFT;
export const SOCKET_TCP_DISPOSE = ++call_id << CALL_SHIFT;
// Udp
export const SOCKET_UDP_CREATE_HANDLE = ++call_id << CALL_SHIFT;
export const SOCKET_UDP_BIND = ++call_id << CALL_SHIFT;
export const SOCKET_UDP_CONNECT = ++call_id << CALL_SHIFT;
export const SOCKET_UDP_DISCONNECT = ++call_id << CALL_SHIFT;
export const SOCKET_UDP_CHECK_SEND = ++call_id << CALL_SHIFT;
export const SOCKET_UDP_SEND = ++call_id << CALL_SHIFT;
export const SOCKET_UDP_RECEIVE = ++call_id << CALL_SHIFT;
export const SOCKET_UDP_DISPOSE = ++call_id << CALL_SHIFT;
export const SOCKET_UDP_GET_LOCAL_ADDRESS = ++call_id << CALL_SHIFT;
export const SOCKET_UDP_GET_REMOTE_ADDRESS = ++call_id << CALL_SHIFT;
export const SOCKET_UDP_SET_RECEIVE_BUFFER_SIZE = ++call_id << CALL_SHIFT;
export const SOCKET_UDP_SET_SEND_BUFFER_SIZE = ++call_id << CALL_SHIFT;
export const SOCKET_UDP_SET_UNICAST_HOP_LIMIT = ++call_id << CALL_SHIFT;
// Name lookup
export const SOCKET_RESOLVE_ADDRESS_CREATE_REQUEST = ++call_id << CALL_SHIFT;
export const SOCKET_RESOLVE_ADDRESS_GET_AND_DISPOSE_REQUEST = ++call_id << CALL_SHIFT;
export const SOCKET_RESOLVE_ADDRESS_DISPOSE_REQUEST = ++call_id << CALL_SHIFT;

export const reverseMap = {};

import * as calls from './calls.js';

for (const name of Object.getOwnPropertyNames(calls)) {
  if (name === 'reverseMap') continue;
  reverseMap[calls[name]] = name;
}
