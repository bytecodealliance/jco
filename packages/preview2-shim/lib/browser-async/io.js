// wasi:io@0.2.0 interfaces

import { IoError } from './io/error.js';
export const error = { Error: IoError };

export * as poll from './io/poll.js';
export * as streams from './io/streams.js';
