/** WASI imports that should be considered asynchronous when present */
const ASYNC_WASI_IMPORTS = [
    'wasi:io/poll#poll',
    'wasi:io/poll#[method]pollable.block',
    'wasi:io/streams#[method]input-stream.blocking-read',
    'wasi:io/streams#[method]input-stream.blocking-skip',
    'wasi:io/streams#[method]output-stream.blocking-flush',
    'wasi:io/streams#[method]output-stream.blocking-write-and-flush',
    'wasi:io/streams#[method]output-stream.blocking-write-zeroes-and-flush',
    'wasi:io/streams#[method]output-stream.blocking-splice',
];

/** WASI exports that should be considered asynchronous when present */
const ASYNC_WASI_EXPORTS = [
    'wasi:cli/run#run',
    'wasi:http/incoming-handler#handle',
];
