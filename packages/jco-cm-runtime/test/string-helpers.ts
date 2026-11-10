import { initializeUtf8Decoder, initializeUtf16Decoder } from '../src/intrinsics/string.js';

/** The string lifting context of the default platform: its trap constructor and fresh decoders. */
export function stringDecoders() {
    return { RuntimeError: WebAssembly.RuntimeError, utf8: initializeUtf8Decoder(), utf16: initializeUtf16Decoder() };
}
