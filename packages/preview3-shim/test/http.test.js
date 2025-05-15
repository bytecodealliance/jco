import { describe, test, expect } from 'vitest';
import { TextEncoder, TextDecoder } from 'util';

import { Fields, HttpError } from '@bytecodealliance/preview3-shim/http';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

describe('Fields tests', () => {
    test('constructs fields with multiple values per name', () => {
        const fields = Fields.fromList([
            ['X-Test', [encoder.encode('one'), encoder.encode('two')]],
        ]);
        const values = fields.get('x-test').map((v) => decoder.decode(v));
        expect(values).toEqual(['one', 'two']);
        expect(fields.has('X-TEST')).toBe(true);
    });

    test('throws forbidden error for a forbidden header name', () => {
        expect(() => {
            Fields.fromList([['Host', encoder.encode('example')]]);
        }).toThrow(HttpError);

        try {
            Fields.fromList([['Connection', encoder.encode('keep-alive')]]);
        } catch (err) {
            expect(err).toBeInstanceOf(HttpError);
            expect(err.payload.tag).toBe('forbidden');
        }
    });

    test('appends and retrieves values correctly', () => {
        const f = new Fields();
        f.append('X-Custom', encoder.encode('a'));
        f.append('x-custom', encoder.encode('b'));
        expect(f.has('X-CUSTOM')).toBe(true);
        const result = f.get('x-custom').map((v) => decoder.decode(v));
        expect(result).toEqual(['a', 'b']);
    });

    test('preserves insertion order in entries()', () => {
        const f = new Fields();
        f.append('A', encoder.encode('1'));
        f.append('B', encoder.encode('2'));
        const ents = f.entries().map(([n, v]) => [n, decoder.decode(v)]);
        expect(ents).toEqual([
            ['A', '1'],
            ['B', '2'],
        ]);
    });

    test('set replaces previous values', () => {
        const f = new Fields();
        f.append('Tok', encoder.encode('one'));
        f.set('Tok', [encoder.encode('two'), encoder.encode('three')]);
        const vals = f.get('tok').map((v) => decoder.decode(v));
        expect(vals).toEqual(['two', 'three']);
    });

    test('delete removes the header entirely', () => {
        const f = new Fields();
        f.append('D', encoder.encode('x'));
        f.delete('d');
        expect(f.has('D')).toBe(false);
        expect(f.get('d')).toEqual([]);
    });

    test('getAndDelete returns old values and deletes', () => {
        const f = new Fields();
        f.append('G', encoder.encode('v1'));
        f.append('G', encoder.encode('v2'));
        const old = f.getAndDelete('g').map((v) => decoder.decode(v));
        expect(old).toEqual(['v1', 'v2']);
        expect(f.has('G')).toBe(false);
    });

    test('throws invalid-syntax on setting an invalid name', () => {
        const f = new Fields();
        expect(() => f.set('\nBad', [encoder.encode('x')])).toThrow(HttpError);
    });

    test('throws forbidden on setting a forbidden name', () => {
        const f = new Fields();
        expect(() => f.set('Host', [encoder.encode('h')])).toThrow(HttpError);
    });
});
