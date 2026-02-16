/** @module Interface wasi:cli/types@0.3.0-rc-2026-02-09 **/
/**
 * # Variants
 * 
 * ## `"io"`
 * 
 * Input/output error
 * ## `"illegal-byte-sequence"`
 * 
 * Invalid or incomplete multibyte or wide character
 * ## `"pipe"`
 * 
 * Broken pipe
 */
export type ErrorCode = 'io' | 'illegal-byte-sequence' | 'pipe';
