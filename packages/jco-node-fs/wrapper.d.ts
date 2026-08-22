export type Advice = 'normal' | 'sequential' | 'random' | 'will-need' | 'dont-need' | 'no-reuse';

/**
 * Declare the expected access pattern for a region of an open file.
 *
 * A length of zero applies the advice from `offset` through the end of the file.
 * On hosts without a runtime file-advice API, this succeeds without issuing a hint.
 */
export function fadvise(fd: number, offset: bigint, length: bigint, advice: Advice): void;
