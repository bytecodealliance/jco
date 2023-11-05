let call_id = 0;

// Call is a 32 bit integer, leading 16 bits are call number, trailing 16 bits allow custom call types
export const CALL_MASK = 0xFF000000;
export const CALL_TYPE_MASK = 0x00FFFFFF;
export const CALL_SHIFT = 24;

// Io Input Stream
export const INPUT_STREAM_CREATE = ++call_id << CALL_SHIFT;
export const INPUT_STREAM_READ = ++call_id << CALL_SHIFT;
export const INPUT_STREAM_BLOCKING_READ = ++call_id << CALL_SHIFT;
export const INPUT_STREAM_SKIP = ++call_id << CALL_SHIFT;
export const INPUT_STREAM_BLOCKING_SKIP = ++call_id << CALL_SHIFT;
export const INPUT_STREAM_SUBSCRIBE = ++call_id << CALL_SHIFT;
export const INPUT_STREAM_DROP = ++call_id << CALL_SHIFT;

// Io Output Stream
export const OUTPUT_STREAM_CREATE = ++call_id << CALL_SHIFT;
export const OUTPUT_STREAM_CHECK_WRITE = ++call_id << CALL_SHIFT;
export const OUTPUT_STREAM_WRITE = ++call_id << CALL_SHIFT;
export const OUTPUT_STREAM_BLOCKING_WRITE_AND_FLUSH = ++call_id << CALL_SHIFT;
export const OUTPUT_STREAM_FLUSH = ++call_id << CALL_SHIFT;
export const OUTPUT_STREAM_BLOCKING_FLUSH = ++call_id << CALL_SHIFT;
export const OUTPUT_STREAM_WRITE_ZEROES = ++call_id << CALL_SHIFT;
export const OUTPUT_STREAM_BLOCKING_WRITE_ZEROES_AND_FLUSH = ++call_id << CALL_SHIFT;
export const OUTPUT_STREAM_SPLICE = ++call_id << CALL_SHIFT;
export const OUTPUT_STREAM_BLOCKING_SPLICE = ++call_id << CALL_SHIFT;
export const OUTPUT_STREAM_SUBSCRIBE = ++call_id << CALL_SHIFT;
export const OUTPUT_STREAM_DROP = ++call_id << CALL_SHIFT;

// Io Poll
export const POLL_POLLABLE_READY = ++call_id << CALL_SHIFT;
export const POLL_POLLABLE_BLOCK = ++call_id << CALL_SHIFT;
export const POLL_POLL_LIST = ++call_id << CALL_SHIFT;

// Http
export const HTTP_CREATE_REQUEST = ++call_id << 24;
