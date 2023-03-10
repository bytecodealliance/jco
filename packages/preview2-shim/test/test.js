import { ok } from 'node:assert';

suite('Node.js', async () => {
  test('Basic importing', async () => {
    const { default: wasiImport } = await import('@bytecodealliance/preview2-shim');
    ok(wasiImport['wasi-filesystem'].stat);
  });
});
