import type { Named, Outcomes } from 'test:result-payloads/payloads';

export const outcomes: Outcomes = {
    neither: { tag: 'err' },
    onlyErr: { tag: 'ok' },
    onlyOk: { tag: 'err' },
    both: { tag: 'ok', val: 1 },
    optionalOk: { tag: 'ok', val: undefined },
};

export const withValues: Outcomes = {
    neither: { tag: 'ok', val: undefined },
    onlyErr: { tag: 'err', val: 'failed' },
    onlyOk: { tag: 'ok', val: 1 },
    both: { tag: 'err', val: 'failed' },
    optionalOk: { tag: 'ok', val: 1 },
};

export const named: Named = { tag: 'ok' };

// @ts-expect-error an arm with a payload requires its value
export const missingOk: Outcomes['onlyOk'] = { tag: 'ok' };

// @ts-expect-error an arm with a payload requires its value
export const missingErr: Outcomes['onlyErr'] = { tag: 'err' };

// @ts-expect-error an optional payload is still a payload
export const missingOptional: Outcomes['optionalOk'] = { tag: 'ok' };

/** Narrowing on the tag still yields the payload types. */
export function describe(outcome: Outcomes['both']): string {
    if (outcome.tag === 'ok') {
        const value: number = outcome.val;
        return value.toString();
    }
    const message: string = outcome.val;
    return message;
}
