import { assert, test } from 'vitest';
import {
    countFactoryCalls,
    namedImports,
    omitBindingChecks,
    omitReceiverBinding,
    omitUnusedNamespaces,
    requestedFactoryMembers,
} from './transforms.js';

const factoryBinding = `const _jcoIntrinsics = {};
const selected = (() => { const receiver = _jcoIntrinsics?.conversion;
const intrinsic = receiver?.toUint32;
if (!intrinsic) { throw new TypeError('Jco Component Model runtime missing conversion'); }
return intrinsic.bind(receiver); })();`;
const namedBinding = `import { toUint32 as selected } from '@bytecodealliance/jco-cm-runtime/intrinsics/conversion';`;

test.concurrent('factory edits are explicit and refuse named bindings', () => {
    assert.deepEqual(requestedFactoryMembers(factoryBinding), ['conversion.toUint32']);
    const checks = omitBindingChecks(factoryBinding);
    assert.equal(checks.changedNodes, 1);
    assert.notInclude(checks.code, 'throw new TypeError');
    const receiver = omitReceiverBinding(factoryBinding);
    assert.equal(receiver.changedNodes, 1);
    assert.include(receiver.code, 'return intrinsic;');
    assert.throws(() => omitBindingChecks(namedBinding), /Factory-only/);
    assert.throws(() => omitReceiverBinding(namedBinding), /Factory-only/);
    assert.deepEqual(namedImports(namedBinding), [
        {
            specifier: '@bytecodealliance/jco-cm-runtime/intrinsics/conversion',
            names: [{ exported: 'toUint32', local: 'selected' }],
        },
    ]);
});

test.concurrent('namespace selection is a frozen-factory diagnostic with visible edits', () => {
    const source = `export function createRuntime() { const waitable = createWaitable(); const host = createHost(); return { intrinsics: { conversion: {}, waitable, host } }; }`;
    const result = omitUnusedNamespaces(source, new Set(['conversion']));
    assert.equal(result.changedNodes, 3);
    assert.notInclude(result.code, 'createWaitable()');
    assert.notInclude(result.code, 'createHost()');
    assert.throws(() => omitUnusedNamespaces(namedBinding, new Set()), /Factory-only/);
});

test.concurrent('instrumented factories preserve nested array elisions and do not instrument methods', () => {
    const source =
        'export function createOwner() { const values = [1,,3]; return { values, createMethod() { return 42; } }; }';
    const result = countFactoryCalls(source);
    assert.equal(result.changedNodes, 1);
    assert.include(result.code, '[1,,3]');
    assert.equal(result.code.match(/__jcoFactoryCounts/g)?.length, 1);
    assert.include(result.code, 'createMethod() { return 42; }');
});
